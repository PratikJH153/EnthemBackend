import { createServer } from "http";
import { Server } from "socket.io";
import { Container } from "typedi";
import config from "../config";
import RoomService from "../services/room_service";


export default (app) => {
  const server = createServer(app);
  const io = new Server(server);
  const roomService = Container.get(RoomService);
  io.on("connection", (socket) => {
    console.log("Backend Connected");
    var roomID: string;

    socket.on('disconnect', async () => {
      console.log("User Disconnected");
      console.log("User removed");
      socket.leave(roomID);
    })

    //encryption and decryption in messages
    socket.on("sendMsg", (msg) => {
      const receiverChatID =  msg.receiverChatID;
      const sender = msg.sender;
      const content = msg.content; // Encrypt the message content using the secret key
      const timestamp = msg.timestamp;
      const encryptedMsg = {
        content: content,
        sender: sender,
        receiverChatID: receiverChatID,
        timestamp: timestamp
      };
      console.log(encryptedMsg);
      socket.broadcast.in(receiverChatID).emit("sendMsgServer", encryptedMsg);
    });

    socket.on("receiveMsg", (msg) => {
      console.log("Encrypted message received!", msg);
      const receiverChatID = msg.receiverChatID;
      const senderChatID = msg.senderChatID;
      const content =msg.content; // Decrypt the message content using the secret key
      const decryptedMsg = {
        content: content,
        senderChatID: senderChatID,
        receiverChatID: receiverChatID,
      };
      socket.broadcast.in(receiverChatID).emit("receiveMsgServer", decryptedMsg);
    });

    
    //delete chat room
    socket.on("deleteRoom", async (data) => {
      try {
        console.log(data["roomID"]);
        socket.to(data["roomID"]).emit("groupDeleted", { message: "Group deleted by admin!" });
      } catch (error) {
        console.log(error);
      }
    });

    //add member to memberlist of chat room
    socket.on("joinRoom", async (data) => {
      try {
        const { id, memberID, username } = data;
        roomID = id;
        socket.join(roomID);
        console.log(roomID);
        console.log(await roomService.addMember(roomID, memberID));
        socket.to(roomID).emit("userJoinedRoom", { memberId: memberID, username: username });
      } catch (error) {
        console.log(error);
      }
    });

    //remove member from chat room by Admin(owner)
    socket.on("removeMember", async (data) => {
      try {
        const { roomID, memberID, username } = data;
        await roomService.removeMember(roomID, memberID);
        socket.to(roomID).emit("bye", { memberId: memberID, username:username });
        console.log("User left successfully!");
      } catch (error) {
        console.log(error);
      }
    });
    
    socket.on("adminRemoved", async (data) => {
      try {
        const { roomID, memberID, username } = data;
        await roomService.removeMember(roomID, memberID);
        socket.to(roomID).emit("userRemoved", { memberId: memberID,username: username });
        console.log("User removed successfully!");
      } catch (error) {
        console.log(error);
      }
    });
    
    
  });
  
  server.listen(config.socketPort, () => {
    console.log(`Socket listening on ${config.socketPort}`);
  })
};