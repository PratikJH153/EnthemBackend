import dotenv from 'dotenv';

process.env.NODE_ENV = process.env.NODE_ENV || 'dev';

if(process.env.NODE_ENV === 'dev'){
  const envFound = dotenv.config();
  if (envFound.error) {
  }
}

export default {
  port: parseInt(process.env.PORT, 10),
  socketPort: process.env.SOCKET_PORT,
  mode: process.env.MODE,

  databaseURL: process.env.DB_HOST,
  dbUser: process.env.DB_USER,
  dbPass: process.env.DB_PASSWORD,
  
  mongoDB: process.env.MONGO_DB_URL,

  jwtSecret: process.env.JWT_SECRET,
  secretKEY : process.env.SECRET_KEY,

  logs: {
    level: process.env.LOG_LEVEL || 'silly',
  },

  api: {
    prefix: '',
  },
  
};
