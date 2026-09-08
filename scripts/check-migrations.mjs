import { database } from '../tests/database.mjs';
try { const db=await database(); console.log('All migrations executed successfully against PostgreSQL (PGlite).'); await db.close(); }
catch(e) {console.error(e.message);process.exitCode=1;}
