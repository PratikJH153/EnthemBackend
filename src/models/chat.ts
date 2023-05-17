import mongoose from 'mongoose';
import { IRoom } from '../interfaces/IRoom';

const Chat = new mongoose.Schema(
  {
    user1ID: {
      type: String,
      required: [true, 'id is required'],
    },    
    user2ID: {
        type: String,
        required: [true, 'id is required'],
    },
    isDisabled: {
        type: String,
        required: false,
        default: null
    },
    messagesID: {
        type: String,
        required: true
    },   
    createdAt: {
        type: Date,
        required:false,
        default: Date.now
    },
  },
  { collection: 'chats', timestamps: true }
);

export default mongoose.model<IRoom & mongoose.Document>('chatModel', Chat);
