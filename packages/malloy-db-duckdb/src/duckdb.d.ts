declare module "duckdb" {
  class Connection {
    constructor(db: Database, callback: () => void);
    all(sql: string, callback: (error: Error, result: any) => void): void;
  }

  class Database {
    constructor(path: string);
    constructor();
    constructor(path: string, mode: Number, callback?: (err: Error) => void);

    connect(): Connection;
    all(sql: string, callback: (error: Error, result: any) => void): void;
  }

  export const OPEN_READONLY: Number;
  export const OPEN_READWRITE: Number;
}
