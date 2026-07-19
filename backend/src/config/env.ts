import 'dotenv/config';

export const config = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || '127.0.0.1',
  CDP_PORT: parseInt(process.env.CDP_PORT || '9000', 10),
  CDP_HOST: process.env.CDP_HOST || '127.0.0.1',
};
