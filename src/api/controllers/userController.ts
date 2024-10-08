import { Request, Response, NextFunction } from 'express';
import { Driver } from "neo4j-driver";
import debugError from '../../services/debug_error';
import config from '../../config/index';
import Jwt from 'jsonwebtoken';
import { defaultPhotoURL } from '../../constants/production_mode';
import { UserFactory } from '../../interfaces/IUser';

export default class UserController {
  private db: Driver;
  constructor(
    db: Driver
  ) {
    this.db = db;
  }


  public test = async (req: Request, res: Response, next: NextFunction) => {
    return res.status(200).json({ status: 200, data: `User Routes Working!`});
  };


  public getAllUsers = async (req: Request, res: Response, next: NextFunction) => {
    const session = this.db.session({ database: "neo4j" });
    try {
      const max: number = +req.query.max || 10;
      const offset: number = +req.query.offset || 0;
      const skip: number = offset * max;
  
      const query = `
        MATCH (n:User)
        OPTIONAL MATCH (n)-[:HAS_INTEREST]->(i:Interest)
        RETURN n.uid AS uid, n.username AS username, n.email AS email, n.age AS age,
          n.gender AS gender, n.photoURL AS photoURL, n.languages as languages, n.college as college,
          n.latitude AS latitude, n.longitude AS longitude, COLLECT(i.name) AS interests
        SKIP ${skip} LIMIT ${max};
      `;
  
      const result = await session.run(query);
  
      const resultList = result.records.map(record => ( UserFactory.createUserFromRecord(record)));
  
      return res.status(200).json({ status: 200, data: resultList });
    } catch (error) {
      debugError(error.toString());
      return next(error);
    } finally{
      session.close();
    }
  };
  


  public updateUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = this.db.session({ database: "neo4j" });
      const { id, ...params } = req.body;
      console.log(params);
      if (params.hasOwnProperty('username')) {
        const username = params["username"].replace(/\s+/g, '').toLowerCase();
        const usernameCheckQuery = `
          MATCH (n:User)
          WHERE toLower(REPLACE(n.username, ' ', '')) = $username AND n.uid <> $id
          RETURN n.uid AS uid;
        `;
        const usernameCheckResult = await session.run(usernameCheckQuery, { username, id });

        if (usernameCheckResult.records.length > 0) {
          return res.status(400).json({ status: 400, data: 'Username already exists' });
        }
      }

      const existingUser = await session.run(`
        MATCH (u:User {uid: "${req.body.uid}"})
        RETURN u
      `, { id });

      if (!existingUser.records.length) {
        console.log('Sorry, No such user exists!');
        return res.status(404).json({ status: 404, data: 'User not found' });
      }

      const setStatements = Object.entries(params).map(([key, value]) => `u.${key} = $${key}`);
      const setQuery = setStatements.join(', ');

      const updateQuery = `
        MATCH (u:User {uid: "${req.body.uid}"})
        SET ${setQuery}
        RETURN u.username AS username, u.age AS age, u. photoURL as photoURL, u.latitude AS latitude, u.longitude AS longitude, u.gender AS gender
      `;

      const result = await session.run(updateQuery, { id, ...params });
      session.close();
      return res.status(200).json({ status: 200, data: "User updated!" });
    } catch (e) {
      debugError(e.toString());
      return next(e);
    }
  };


  public getUserBySessionId = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = this.db.session({ database: "neo4j" });
      console.log(req.body.uid);
      const query = `
      MATCH (n:User {uid: '${req.body.uid}'})
      OPTIONAL MATCH (n)-[:HAS_INTEREST]->(i:Interest)
      RETURN
        n.uid AS uid,
        n.username AS username,
        n.email AS email,
        n.age AS age,
        n.gender AS gender,
        n.photoURL AS photoURL,
        n.latitude AS latitude,
        n.longitude AS longitude,
        n.college AS college,
        COLLECT(i.name) AS interests;
    `;
      // COLLECT(DISTINCT n2.name) AS interests
      const result = await session.run(query);
      if (result.records.length > 0) {
        const record = result.records[0];
        const data = {
          uid: record.get('uid') ,
          username: record.get('username'),
          email:  record.get('email') ,
          age: record.get('age').toNumber(),
          gender: record.get('gender'),
          photoURL: record.get('photoURL') ?? defaultPhotoURL,
          latitude: record.get('latitude'),
          longitude: record.get('longitude'),
          interests: record.get('interests'),
          college: record.get('college')
        };
        session.close();
        return res.status(200).json({ status: 200, data: data });
      } else {
        return res.status(404).json({ status: 404, data: "Sorry, No User Exists with this uid !" });
      }
    } catch (e) {
      debugError(e.toString());
      return next(e);
    }
  };


  public isUserExists = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = this.db.session({ database: "neo4j" });

      console.log(req.body.uid);
      
      const query = `
      MATCH (n:User {uid:"${req.body.uid }"})
      RETURN n.uid AS uid;
    `;
      const result = await session.run(query);
      const record = result.records[0];
      session.close();
      if (record != null) {
        return res.status(200).json({ status: 200, data: true });
      }
      return res.status(404).json({ status: 404, data: false });
    } catch (e) {
      debugError(e.toString());
      return next(e);
    }
  };

  public isUsernameExists = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = this.db.session({ database: "neo4j" });
      const username = req.body.username.replace(/\s+/g, "").toLowerCase();
      const query = `
        MATCH (n:User)
        WHERE replace(toLower(n.username), " ", "") = '${username}'
        RETURN n.uid AS uid;
      `;
      const result = await session.run(query);
      const record = result.records[0];
      session.close();
      if (record != null) {
        return res.status(200).json({ status: 200, data: true });
      }
      return res.status(404).json({ status: 404, data: false });
    } catch (e) {
      debugError(e.toString());
      return next(e);
    }
  };


  public createUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = this.db.session({ database: "neo4j" });
      const userInput = req.body;
      
      // Check if all required properties are present
      if (!userInput.uid || !userInput.username || !userInput.email || userInput.latitude == null || userInput.longitude == null) {
        return res.status(400).json({ error: "Missing required fields" });
      }
  
      const checkEmailQuery = `
        MATCH (u:User)
        WHERE u.email = "${userInput.email}"
        RETURN u
      `;
      const emailResult = await session.run(checkEmailQuery);
  
      if (emailResult.records.length > 0) {
        // User already exists, so update their uid
        const updateQuery = `
          MATCH (u:User { email: "${userInput.email}" })
          SET u.uid = "${userInput.uid}"
          RETURN u
        `;
        await session.run(updateQuery);
        session.close();
        return res.status(200).json({ status: 200, data: "User updated!" });
      } else {
        // User doesn't exist, so create a new one
        const createUserQuery = `
          CREATE (u:User {
            uid: "${userInput.uid}",
            username: "${userInput.username}",
            email: "${userInput.email}",
            photoURL: "${userInput.photoURL}",
            gender: COALESCE("${userInput.gender}", "Unknown"),
            age: COALESCE(${userInput.age}, 20),
            latitude: ${userInput.latitude},
            longitude: ${userInput.longitude},
            languages: ${userInput.languages? JSON.stringify(userInput.languages): null},
            college: ${userInput.college ? JSON.stringify(userInput.college): null}
          })
          RETURN u
        `;
        await session.run(createUserQuery);
  
        const createInterestsQuery = `
          MATCH (u:User { uid: "${userInput.uid}" })
          UNWIND ${JSON.stringify(userInput.interests)} AS interest
          MATCH (i:Interest {name: interest})
          CREATE (u)-[:HAS_INTEREST]->(i)
        `;
        await session.run(createInterestsQuery);
  
        const token = Jwt.sign({ uid: userInput.uid }, config.jwtSecret, {
          expiresIn: 86400
        });
        console.log(token);
        session.close();
        return res.status(200).json({ status: 200, data: "User created!", token: token });
      }
    } catch (error) {
      debugError(error.toString());
      return next(error);
    }
  };
  


  public deleteUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = this.db.session({ database: "neo4j" });
      const query = `
      MATCH (u:User {uid: "${req.body.uid}"})
      WITH u LIMIT 1
      OPTIONAL MATCH (u)-[r]-()
      DELETE u, r
      RETURN COUNT(u) as deleted
    `;
      const result = await session.run(query);
      const deleted = result.records[0].get("deleted").toNumber();
      session.close();
      if (deleted === 0) {
        return res.status(404).json({ status: 404, data: "User does not exist and cannot be deleted." });
      } else {
        return res.status(201).json({ status: 201, data: "User Profile Deleted Successfully !" });
      }
    } catch (e) {
      debugError(e.toString());
      return res.status(500).json({ status: 500, data: "Sorry, there was an error deleting the user." });
    }
  };


  public locRecommend = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = this.db.session({ database: "neo4j" });
      const max: number = +req.query.max || 10;
      const offset: number = +req.query.offset || 0;
      const skip: number = offset * max;

      const query = `
      MATCH (u:User)
      WHERE u.uid = "${req.body.uid}" 
      AND u.latitude IS NOT NULL AND u.longitude IS NOT NULL 
      MATCH (u2:User)
      WHERE u2.uid <> u.uid 
      AND u2.latitude IS NOT NULL AND u2.longitude IS NOT NULL 
      WITH u, u2,
          toFloat(u.latitude) * pi() / 180.0 AS lat1, 
          toFloat(u.longitude) * pi() / 180.0 AS lon1,
          toFloat(u2.latitude) * pi() / 180.0 AS lat2, 
          toFloat(u2.longitude) * pi() / 180.0 AS lon2,
          3959.0 AS r
      WITH u, u2, r * asin(sqrt(sin((lat2 - lat1) / 2)^2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2)^2)) * 2.0 AS distance
      WHERE distance <= 10000
      RETURN DISTINCT u2.username as username, u2.email as email, u2.gender as gender, 
      u2.age as age, u2.latitude as latitude, u2.longitude as longitude, u2.photoURL as photoURL 
      SKIP ${skip} LIMIT ${max}
    
    `;

      const result = await session.run(query);
      if (result.records.length > 0) {
        const resultList = result.records.map(record => ({
          username: record.get('username'),
          email: record.get('email'),
          age: record.get('age').toNumber(),
          gender: record.get('gender'),
          photoURL: record.get('photoURL'),
          latitude: record.get('latitude'),
          longitude: record.get('longitude')
        }));
        session.close();
        return res.status(200).json({ status: 200, data: resultList });
      } else {
        return res.status(404).json({ status: 404, data: [] });
      }
    } catch (e) {
      debugError(e.toString());
      return next(e);
    }
  };


  // public nearBy = async (req: Request, res: Response, next: NextFunction) => {
  //   try {
  //     const session = this.db.session({ database: "neo4j" });
  //     const max: number = +req.query.max || 3;
  //     const offset: number = +req.query.offset || 0;
  //     const skip: number = offset * max;

  //     const query = `
  //     MATCH (u:User)-[:HAS_INTEREST]->(s:Interest)<-[:HAS_INTEREST]-(u2:User)
  //     WHERE u.id = "${decrypt(req.body.id, config.secretKEY)}"
  //       AND u.latitude IS NOT NULL AND u.longitude IS NOT NULL 
  //       AND u2.id <> u.id 
  //       AND u2.latitude IS NOT NULL AND u2.latitude <> -90 AND u2.longitude IS NOT NULL AND u2.longitude <> 0
  //     WITH u, u2, s, u.latitude * pi() / 180 AS lat1, u.longitude * pi() / 180 AS lon1,
  //         u2.latitude * pi() / 180 AS lat2, u2.longitude * pi() / 180 AS lon2,
  //         3959 AS r
  //     WITH u, u2, s, lat1, lon1, lat2, lon2, r,
  //         sin((lat2 - lat1) / 2) ^ 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ^ 2 AS a
  //     WITH u, u2, s, r * 2 * atan2(sqrt(a), sqrt(1 - a)) AS distance
  //     WHERE distance <= 1000
  //     RETURN DISTINCT u2.username AS username, u2.email AS email, 
  //           u2.gender AS gender, u2.age AS age, u2.latitude AS latitude, u2.longitude AS longitude, 
  //           u2.photoURL AS photoURL, distance, COLLECT(s) AS interests
  //     ORDER BY distance ASC
  //     SKIP ${skip} LIMIT ${max}

  //   `;

  //     const result = await session.run(query);
  //     if (result.records.length > 0) {
  //       const resultList = result.records.map(record => ({
  //         username: record.get('username'),
  //         email: encrypt(record.get('email'), config.secretKEY),
  //         age: record.get('age').toNumber(),
  //         gender: record.get('gender'),
  //         photoURL: record.get('photoURL'),
  //         latitude: record.get('latitude'),
  //         longitude: record.get('longitude'),
  //         distance:record.get('distance'),
  //         interests: record.get('interests').map((e) => e["properties"]["name"] as String)
  //       }));
  //       session.close();
  //       return res.status(200).json({ status: 200, data: resultList });
  //     } else {
  //       return res.status(404).json({ status: 404, data: [] });
  //     }
  //   } catch (e) {
  //     debugError(e.toString());
  //     return next(e);
  //   }

  // };

  public nearBy = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = this.db.session({ database: "neo4j" });
      const max: number = +req.query.max || 3;
      const offset: number = +req.query.offset || 0;
      const skip: number = offset * max;
      const userId = req.body.uid;
  
      const query = `
        MATCH (u:User)-[:HAS_INTEREST]->(s:Interest)<-[:HAS_INTEREST]-(u2:User)
        WHERE u.uid = "${userId}" AND NOT EXISTS((u)-[:HAS_LIKED]->(u2))
          AND u.latitude IS NOT NULL AND u.longitude IS NOT NULL 
          AND u2.uid <> u.uid 
          AND u2.latitude IS NOT NULL AND u2.latitude <> -90 AND u2.longitude IS NOT NULL AND u2.longitude <> 0
        WITH u, u2, s, u.latitude * pi() / 180 AS lat1, u.longitude * pi() / 180 AS lon1,
            u2.latitude * pi() / 180 AS lat2, u2.longitude * pi() / 180 AS lon2,
            3959 AS r
        WITH u, u2, s, lat1, lon1, lat2, lon2, r,
            sin((lat2 - lat1) / 2) ^ 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ^ 2 AS a
        WITH u, u2, s, r * 2 * atan2(sqrt(a), sqrt(1 - a)) AS distance
        WHERE distance <= 1000
        RETURN DISTINCT u2.username AS username, u2.email AS email, 
              u2.gender AS gender, u2.age AS age, u2.latitude AS latitude, u2.longitude AS longitude, 
              u2.photoURL AS photoURL, distance, COLLECT(s) AS interests
        ORDER BY distance ASC
        SKIP ${skip} LIMIT ${max}
      `;

      //TODO: Algorithm with language and nationality
  
      // MATCH (u:User)-[:HAS_INTEREST]->(s:Interest)<-[:HAS_INTEREST]-(u2:User)
      // WHERE u.uid = 3
      //   AND u.location IS NOT NULL 
      //   AND u2.uid <> u.uid 
      //   AND u2.location[0] IS NOT NULL AND u2.location[0] <> -90 AND u2.location[1] IS NOT NULL AND u2.location[1] <> 0
      // WITH u, u2, 
      //     u.location[0] * pi() / 180 AS lat1, u.location[1] * pi() / 180 AS lon1,
      //     u2.location[0] * pi() / 180 AS lat2, u2.location[1] * pi() / 180 AS lon2,
      //     3959 AS r,
      //     CASE WHEN u.nationality = u2.nationality THEN 1 ELSE 0 END AS nationality_similarity,
      //     CASE WHEN u.language = u2.language THEN 1 ELSE 0 END AS language_similarity,
      //     COLLECT(DISTINCT s) AS interests_in_common
      // WITH u, u2, lat1, lon1, lat2, lon2, r,
      //     sin((lat2 - lat1) / 2) ^ 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ^ 2 AS a,
      //     nationality_similarity, language_similarity, SIZE(interests_in_common) AS interests_in_common
      // RETURN DISTINCT u2.username AS username, u2.email AS email, 
      //       u2.gender AS gender, u2.age AS age, u2.location AS location, u2.photoURL AS photoURL, 
      //       nationality_similarity, language_similarity, interests_in_common,
      //       r * 2 * atan2(sqrt(a), sqrt(1 - a)) AS distance
      // ORDER BY (nationality_similarity + language_similarity) DESC, interests_in_common DESC, distance ASC;

      //TODO: Algorithm for Rooms
      `
      MATCH (room:Room)-[:HAS_OWNER]->(u2:User)
      MATCH (u:User)-[:HAS_INTEREST]->(s:Interest)<-[:HAS_INTEREST]-(u2)
      WHERE u.uid = 3
        AND u.location IS NOT NULL 
        AND u2.uid <> u.uid 
      WITH u, u2, room,
           u.location[0] * pi() / 180 AS lat1, u.location[1] * pi() / 180 AS lon1,
           room.latitude * pi() / 180 AS lat2, room.longitude * pi() / 180 AS lon2,
           3959 AS r,
           CASE WHEN u.nationality = u2.nationality THEN 1 ELSE 0 END AS nationality_similarity,
           CASE WHEN u.language = u2.language THEN 1 ELSE 0 END AS language_similarity,
           COLLECT(DISTINCT s) AS interests_in_common
      WITH u, u2, lat1, lon1, lat2, lon2, r, room,
           sin((lat2 - lat1) / 2) ^ 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ^ 2 AS a,
           nationality_similarity, language_similarity, SIZE(interests_in_common) AS interests_in_common
      RETURN DISTINCT room,
             r * 2 * atan2(sqrt(a), sqrt(1 - a)) AS distance, interests_in_common AS interests
      ORDER BY distance ASC, interests;
      `

      const result = await session.run(query);
      if (result.records.length > 0) {
        const resultList = result.records.map((record) => ({
          username: record.get('username'),
          email: record.get('email'),
          age: record.get('age').toNumber(),
          gender: record.get('gender'),
          photoURL: record.get('photoURL'),
          latitude: record.get('latitude'),
          longitude: record.get('longitude'),
          distance: record.get('distance'),
          interests: record.get('interests').map((e) => e['properties']['name'] as string),
        }));
        session.close();
        return res.status(200).json({ status: 200, data: resultList });
      } else {
        return res.status(404).json({ status: 404, data: [] });
      }
    } catch (e) {
      debugError(e.toString());
      return next(e);
    }
  };
  

  // public forYou = async (req: Request, res: Response, next: NextFunction) => {
  //   try {
  //     const session = this.db.session({ database: "neo4j" });
  //     const max: number = +req.query.max || 3;
  //     const offset: number = +req.query.offset || 0;
  //     const skip: number = offset * max;
  //     const query = `
  //     MATCH (u:User)-[:HAS_INTEREST]->(s:Interest)
  //     WHERE u.uid = "${decrypt(req.body.uid, config.secretKEY)}"
  //     WITH u, COLLECT(s) AS interests
  //     MATCH (u2:User)-[:HAS_INTEREST]->(s2:Interest)
  //     WHERE u2.uid <> u.uid
  //     WITH u, u2, interests, COLLECT(s2) AS interests2,
  //       radians(u.latitude) AS u_lat, radians(u.longitude) AS u_lon,
  //       radians(u2.latitude) AS u2_lat, radians(u2.longitude) AS u2_lon
  //     WITH u, u2, 
  //       REDUCE(s = [], x IN interests | 
  //               s + CASE WHEN x IN interests2 THEN x ELSE [] END) AS common_interests,
  //       toFloat(size(REDUCE(s = [], x IN interests | s + x))) AS u_interests,
  //       toFloat(size(interests2)) AS u2_interests,
  //       u_lat, u_lon, u2_lat, u2_lon
  //     WITH u, u2, common_interests,
  //       toFloat(size(common_interests)) / u_interests AS u_similarity,
  //       toFloat(size(common_interests)) / u2_interests AS u2_similarity,
  //       6371 * acos(sin(u_lat) * sin(u2_lat) + cos(u_lat) * cos(u2_lat) * cos(u2_lon - u_lon)) * 0.621371 AS distance_in_miles
  //     RETURN u2.username AS username, u2.email AS email, u2.age AS age, u2.gender AS gender, u2.latitude AS latitude, 
  //       u2.longitude AS longitude, u2.photoURL AS photoURL, 
  //       toInteger(((u_similarity + u2_similarity) / 2) * 100) AS match_percentage,
  //       distance_in_miles
  //     ORDER BY match_percentage DESC
  //     SKIP ${skip} LIMIT ${max}
  //   `;

  //     const result = await session.run(query);
  //     if (result.records.length > 0) {
  //       const resultList = result.records.map(record => ({
  //         username: record.get('username'),
  //         email: encrypt(record.get('email'), config.secretKEY),
  //         age: record.get('age').toNumber(),
  //         gender: record.get('gender'),
  //         photoURL: record.get('photoURL'),
  //         latitude: record.get('latitude'),
  //         longitude: record.get('longitude'),
  //         distance: record.get('distance_in_miles'),
  //         compatibility: record.get('match_percentage').toNumber()
  //       }));
  //       session.close();
  //       return res.status(200).json({ status: 200, data: resultList });
  //     } else {
  //       return res.status(404).json({ status: 404, data: [] });
  //     }
  //   } catch (e) {
  //     debugError(e.toString());
  //     return next(e);
  //   }
  // };

  public forYou = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = this.db.session({ database: "neo4j" });
      const max: number = +req.query.max || 3;
      const offset: number = +req.query.offset || 0;
      const skip: number = offset * max;
      const userId = req.body.uid;
  
      const query = `
        MATCH (u:User)-[:HAS_INTEREST]->(s:Interest)
        WHERE u.uid = "${userId}"
        WITH u, COLLECT(s) AS interests
        MATCH (u2:User)-[:HAS_INTEREST]->(s2:Interest)
        WHERE u2.uid <> u.uid AND NOT EXISTS((u)-[:HAS_LIKED]->(u2))
        WITH u, u2, interests, COLLECT(s2) AS interests2,
          radians(u.latitude) AS u_lat, radians(u.longitude) AS u_lon,
          radians(u2.latitude) AS u2_lat, radians(u2.longitude) AS u2_lon
        WITH u, u2, 
          REDUCE(s = [], x IN interests | 
                  s + CASE WHEN x IN interests2 THEN x ELSE [] END) AS common_interests,
          toFloat(size(REDUCE(s = [], x IN interests | s + x))) AS u_interests,
          toFloat(size(interests2)) AS u2_interests,
          u_lat, u_lon, u2_lat, u2_lon
        WITH u, u2, common_interests,
          toFloat(size(common_interests)) / u_interests AS u_similarity,
          toFloat(size(common_interests)) / u2_interests AS u2_similarity,
          6371 * acos(sin(u_lat) * sin(u2_lat) + cos(u_lat) * cos(u2_lat) * cos(u2_lon - u_lon)) * 0.621371 AS distance_in_miles
        RETURN u2.username AS username, u2.email AS email, u2.age AS age, u2.gender AS gender, u2.latitude AS latitude, 
          u2.longitude AS longitude, u2.photoURL AS photoURL, 
          toInteger(((u_similarity + u2_similarity) / 2) * 100) AS match_percentage,
          distance_in_miles
        ORDER BY match_percentage DESC
        SKIP ${skip} LIMIT ${max}
      `;

//       MATCH (u:User)-[:HAS_INTEREST]->(s:Interest)
// WHERE u.uid = "${userId}"
// WITH u, COLLECT(s) AS interests
// MATCH (u2:User)-[:HAS_INTEREST]->(s2:Interest)
// WHERE u2.uid <> u.uid AND NOT EXISTS((u)-[:HAS_LIKED]->(u2))
// WITH u, u2, interests, COLLECT(s2) AS interests2,
//   radians(u.latitude) AS u_lat, radians(u.longitude) AS u_lon,
//   radians(u2.latitude) AS u2_lat, radians(u2.longitude) AS u2_lon
// WITH u, u2, 
//   REDUCE(s = [], x IN interests | 
//           s + CASE WHEN x IN interests2 THEN x ELSE [] END) AS common_interests,
//   toFloat(size(REDUCE(s = [], x IN interests | s + x))) AS u_interests,
//   toFloat(size(interests2)) AS u2_interests,
//   u_lat, u_lon, u2_lat, u2_lon
// WITH u, u2, common_interests,
//   toFloat(size(common_interests)) / u_interests AS u_similarity,
//   toFloat(size(common_interests)) / u2_interests AS u2_similarity,
//   6371 * acos(sin(u_lat) * sin(u2_lat) + cos(u_lat) * cos(u2_lat) * cos(u2_lon - u_lon)) * 0.621371 AS distance_in_miles
// WITH u, u2, common_interests, distance_in_miles
// ORDER BY distance_in_miles ASC
// WITH COLLECT({user: u, common_interests: common_interests}) AS group_members
// RETURN u2, group_members;
  
      const result = await session.run(query);
      if (result.records.length > 0) {
        const resultList = result.records.map((record) => ({
          username: record.get('username'),
          email: record.get('email'),
          age: record.get('age').toNumber(),
          gender: record.get('gender'),
          photoURL: record.get('photoURL'),
          latitude: record.get('latitude'),
          longitude: record.get('longitude'),
          distance: record.get('distance_in_miles'),
          compatibility: record.get('match_percentage').toNumber(),
        }));
        session.close();
        return res.status(200).json({ status: 200, data: resultList });
      } else {
        return res.status(404).json({ status: 404, data: [] });
      }
    } catch (e) {
      debugError(e.toString());
      return next(e);
    }
  };

  public createInterests = async (req: Request, res: Response, next: NextFunction) => {
    const session = this.db.session({ database: "neo4j" });
    try {
      const interests = req.body.interests.map(interest => `${interest}`);
  
      const query = `
        MATCH (u:User {uid: $uid})
        WITH u
        UNWIND $interests AS interest
        MATCH (s:Interest {name: interest})
        MERGE (u)-[:HAS_INTEREST]->(s)
        RETURN true;
      `;
  
      const result = await session.run(query, {
        uid: req.body.uid,
        interests: interests,
      });


  
      if (result.records.length === 0 || result.records[0].get(0) !== true) {
        return res.status(400).json({ status: 400, data: "Interests were not created!" });
      }
  
      return res.status(201).json({ status: 201, data: "Done creating Interests" });
    } catch (e) {
      debugError(e.toString());
      return next(e);
    } finally {
      session.close();
    }
  };
  


  public interestsUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = this.db.session({ database: "neo4j" });
      const query2 = `
      MATCH (n:User{uid:"${req.body.uid}"})-[r:HAS_INTEREST]->(n2:Interest)
      RETURN COLLECT(DISTINCT n2.name) AS interest
    `;
      const result2 = await session.run(query2);
      session.close();
      if (result2.records[0]["_fields"][0].length > 0) {
        return res.status(200).json({ status: 200, data: result2.records[0]["_fields"][0] });
      } else {
        return res.status(404).json({ status: 404, data: [] });
      }
    } catch (e) {
      debugError(e.toString());
      return next(e);
    }
  };

  public updateInterests = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = this.db.session({ database: "neo4j" });
      const interests = req.body.interests.map(interest => `"${interest}"`).join(', ');
      const interestQuery = `
          WITH [${interests}] AS interestsList
          UNWIND interestsList AS interest
          MERGE (s:Interest {name:interest})
          WITH s
          MATCH (u:User {uid: "${req.body.uid}"})
          MERGE (u)-[:HAS_INTEREST]->(s)
          RETURN u.uid AS uid, collect(s.name) AS interests
      `;
      const result = await session.run(interestQuery);
      if (result.records.length > 0) {
        const resultList = result.records.map(record => ({
          uid:record.get('uid'),
          interests: record.get('interests')
        }));
        session.close();
        return res.status(200).json({ status: 200, data: resultList });
      }
    } catch (error) {
      debugError(error.toString());
      return next(error);
    }
  };

  public custom_fetch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = this.db.session({ database: "neo4j" });

      const fetchQuery = `
        MATCH (u:User)
        WHERE point.distance(point({latitude: u.latitude, longitude: u.longitude}), point({latitude: $latitude, longitude: $longitude})) / 1609.34 <= 1000
        AND (CASE WHEN $age <> '' THEN u.age = $age ELSE true END)
        AND (CASE WHEN $gender <> '' THEN u.gender = $gender ELSE true END)
        AND (CASE WHEN $interests <> '' THEN EXISTS { (u)-[:HAS_INTEREST]->(:Interest {name: $interests}) } ELSE true END)
        RETURN u.username AS username, u.photoURL as photoURL, u.age AS age, u.gender AS gender
      `;
      const params = {
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        age: req.body.age || '',
        gender: req.body.gender ? req.body.gender.toLowerCase() : '',
        interests: req.body.interests || '',
      };
      const result = await session.run(fetchQuery, params);
      if (result.records.length > 0) {
        const resultList = result.records.map(record => ({
          username: record.get('username'),
          photoURL: record.get('photoURL'),
          age: record.get('age').toNumber(),
          gender: record.get('gender')
        }));
        session.close();
        return res.status(200).json({ status: 200, data: resultList });
      } else {
        session.close();
        return res.status(200).json({ status: 200, data: [] });
      }
    } catch (error) {
      debugError(error.toString());
      return next(error);
    }
  };

  public getUsersByIds = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = this.db.session({ database: "neo4j" });
      const idList = req.body.uid;
      const users = [];
      for (const uid of idList) {
        const query = `
                MATCH (n:User{uid:"${uid}"})
                RETURN n.
                username AS username, n.photoURL AS photoURL, n.age AS age, n.gender AS gender, n.email AS email
            `;
        const result = await session.run(query);
        if (result.records.length > 0) {
          const user = result.records[0];
          users.push({
            uid: uid,
            username: user.get('username'),
            photoURL: user.get('photoURL'),
            age: user.get('age').toNumber(),
            gender: user.get('gender'),
            email:user.get('email')
          });
        }
      }
      session.close();
      if (users.length < 1) {
        return res.status(404).json({ status: 200, data: [] });
      }
      return res.status(200).json({ status: 200, data: users });
    } catch (e) {
      debugError(e.toString());
      return next(e);
    }
  };

  public updateRoomsList_add = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = this.db.session({ database: "neo4j" });
      const { uid, roomId } = req.body;
      const query = `
        MATCH (u:User {uid: "${uid}"})
        SET u.rooms = u.rooms + "${roomId}"
        RETURN u.uid AS uid, u.rooms AS rooms
      `;
      const result = await session.run(query);
      session.close();
  
      if (result.records.length > 0) {
        const record = result.records[0];
        const uid = record.get('uid');
        const rooms = record.get('rooms');
        return res.status(200).json({ status: 200, data: { uid, rooms } });
      }
  
      return res.status(404).json({ status: 200, data: null });
    } catch (error) {
      debugError(error.toString());
      return next(error);
    }
  };

  public deleteRooms = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = this.db.session({ database: "neo4j" });
      const { uid, roomId } = req.body;
      const query = `
        MATCH (u:User {uid: "${uid}"})
        SET u.rooms = [roomID IN u.rooms WHERE roomID <> "${roomId}"]
        RETURN u.uid AS uid, u.rooms AS rooms
      `;
      const result = await session.run(query);
      session.close();
  
      if (result.records.length > 0) {
        const record = result.records[0];
        const uid = record.get('uid');
        const rooms = record.get('rooms');
        return res.status(200).json({ status: 200, data: { uid, rooms } });
      }
  
      return res.status(404).json({ status: 200, data: null });
    } catch (error) {
      debugError(error.toString());
      return next(error);
    }
  };

  public post_userLike = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = this.db.session({ database: "neo4j" });
      const { uid, second_uid } = req.body;
      const query = `
        MATCH (a:User {uid: ${uid}}}), (b:User {uid: ${second_uid}}})
        MERGE (a)-[r:HAS_LIKED]->(b)
        RETURN COUNT(r) > 0 AS success
      `;
      const result = await session.run(query, { uid, second_uid });
      session.close();
      if (result.records.length > 0) {
        const record = result.records[0];
        const success = record.get('success');
        return res.status(200).json({ status: 200, data: success });
      }
      return res.status(404).json({ status: 200, data: false });
    } catch (error) {
      debugError(error.toString());
      return next(error);
    }
  };
  

  public get_userLikes = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = this.db.session({ database: "neo4j" });
      const uid = req.body.uid;
      const query = `
        MATCH (a:User {uid: $uid})-[:HAS_LIKED]->(b)
        RETURN b.username AS username, b.email AS email, b.age AS age, b.gender AS gender,
          b.photoURL AS photoURL, b.latitude AS latitude, b.longitude AS longitude
      `;
      const result = await session.run(query, { uid });
      session.close();
  
      const likedEntities = result.records.map((record) => ({
        username: record.get('username'),
        email: record.get('email'),
        age: record.get('age').toNumber(),
        gender: record.get('gender'),
        photoURL: record.get('photoURL'),
        latitude: record.get('latitude'),
        longitude: record.get('longitude')
      }));
  
      return res.status(200).json({ status: 200, data: likedEntities });
    } catch (error) {
      debugError(error.toString());
      return next(error);
    }
  };

  
  public delete_userLike = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = this.db.session({ database: "neo4j" });
      const { uid, second_uid } = req.body;
      const query = `
        MATCH (a:User {uid: $uid})-[r:HAS_LIKED]->(b:User {uid: $second_uid})
        DELETE r
      `;
      const result = await session.run(query, { uid, second_uid });
      session.close();
      const success = result.summary.counters.updates().relationshipsDeleted > 0;
      return res.status(200).json({ status: 200, data: success });
    } catch (error) {
      debugError(error.toString());
      return next(error);
    }
  };
  
  
  // public getUserBySessionId = async (req: Request, res: Response, next: NextFunction) => {
  //   try {
  //     const session = this.db.session({ database: "neo4j" });
  //     const id = decrypt(req.body.id, config.secretKEY);
  //     const query = `
  //       MATCH (a:User {id: $id})
  //       OPTIONAL MATCH (a)-[:HAS_LIKED]->(likedUser)
  //       MATCH (n:User {id: $id})-[r:HAS_INTEREST]->(interestInterest)
  //       RETURN likedUser.username AS likedUsername, likedUser.email AS likedEmail, likedUser.age AS likedAge,
  //         likedUser.gender AS likedGender, likedUser.photoURL AS likedPhotoURL,
  //         likedUser.latitude AS likedLatitude, likedUser.longitude AS likedLongitude,
  //         n.id AS id, n.username AS username, n.email AS email, n.age AS age,
  //         n.gender AS gender, n.photoURL AS photoURL,
  //         n.latitude AS latitude, n.longitude AS longitude, COLLECT(DISTINCT interestInterest.name) AS interests,
  //         n.rooms AS rooms
  //     `;
  //     const result = await session.run(query, { id });
  //     session.close();
  
  //     if (result.records.length > 0) {
  //       const record = result.records[0];
  //       const likedEntities = result.records
  //         .filter((record) => record.get('likedUsername') !== null)
  //         .map((record) => ({
  //           username: record.get('likedUsername'),
  //           email: record.get('likedEmail'),
  //           age: record.get('likedAge').toNumber(),
  //           gender: record.get('likedGender'),
  //           photoURL: record.get('likedPhotoURL'),
  //           latitude: record.get('likedLatitude'),
  //           longitude: record.get('likedLongitude')
  //         }));
  
  //       const data = {
  //         id: encrypt(record.get('id'), config.secretKEY),
  //         username: record.get('username'),
  //         email: encrypt(record.get('email'), config.secretKEY),
  //         age: record.get('age').toNumber(),
  //         gender: record.get('gender'),
  //         photoURL: record.get('photoURL'),
  //         latitude: record.get('latitude'),
  //         longitude: record.get('longitude'),
  //         interests: record.get('interests'),
  //         rooms: record.get('rooms')
  //       };
  
  //       return res.status(200).json({ status: 200, data: { likedEntities, userData: data } });
  //     } else {
  //       return res.status(404).json({ status: 404, data: "Sorry, No User Exists with this ID!" });
  //     }
  //   } catch (error) {
  //     debugError(error.toString());
  //     return next(error);
  //   }
  // };
  
  
  

  public get_likedIds = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = this.db.session({ database: "neo4j" });
      const { uid } = req.body;
      const query = `
        MATCH (a:User {uid: $uid})-[:HAS_LIKED]->(b)
        RETURN b.uid AS uid
      `;
      const result = await session.run(query, { uid });
      session.close();
  
      const likedIds = result.records.map((record) => ({
        uid: record.get('uid')
      }));
  
      return res.status(200).json({ status: 200, data: likedIds });
    } catch (error) {
      debugError(error.toString());
      return next(error);
    }
  };  

  public deleteInterests = async (req:Request, res:Response, next:NextFunction) => {}
  
  
}
