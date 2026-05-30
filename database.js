const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.resolve(__dirname, 'ems.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        
        // Initialize Tables
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS employees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                email TEXT UNIQUE,
                position TEXT,
                department TEXT,
                salary REAL,
                password TEXT
            )`);
            
            // Try to add the password column to existing employees table
            db.run(`ALTER TABLE employees ADD COLUMN password TEXT`, (err) => {
                // Ignore error if column already exists
            });

            db.get('SELECT COUNT(*) AS count FROM users', (err, row) => {
                if (!err && row && row.count === 0) {
                    bcrypt.hash('admin123', 10, (hashErr, hash) => {
                        if (hashErr) {
                            console.error('Error creating default admin password:', hashErr.message);
                            return;
                        }
                        db.run('INSERT INTO users (username, password) VALUES (?, ?)', ['admin', hash], (insertErr) => {
                            if (insertErr) {
                                console.error('Error creating default admin user:', insertErr.message);
                            } else {
                                console.log('Default admin account created: username=admin password=admin123');
                            }
                        });
                    });
                }
            });

            console.log('Database tables initialized.');
        });
    }
});

module.exports = db;
