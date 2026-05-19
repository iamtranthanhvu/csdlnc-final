import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT),
  nodeEnv: process.env.NODE_ENV,

  pg: {
    masterHost: process.env.PG_MASTER_HOST,
    masterPort: Number(process.env.PG_MASTER_PORT),
    slaveHost: process.env.PG_SLAVE_HOST,
    slavePort: Number(process.env.PG_SLAVE_PORT),
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    readonlyUser: process.env.PG_READONLY_USER,
    readonlyPassword: process.env.PG_READONLY_PASSWORD,
  },

  mongo: {
    uri: process.env.MONGO_URI,
  },

  rabbitmq: {
    url: process.env.RABBITMQ_URL,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: Number(process.env.JWT_EXPIRES_IN),
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: Number(process.env.JWT_REFRESH_EXPIRES_IN),
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  },
};
