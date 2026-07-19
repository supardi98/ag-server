declare module 'connect-sqlite3' {
  import session from 'express-session';
  function connectSqlite3(s: typeof session): any;
  export default connectSqlite3;
}
