import {pool,schema} from './db';
try {await pool.query(schema);console.log('PostgreSQL schema ready');}finally{await pool.end();}
