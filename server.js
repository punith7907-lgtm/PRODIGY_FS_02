const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');

const app = express();
const PORT = 5000;
const SECRET_KEY = 'super_secret_for_prodigy_task_02'; // In production, use env variables

app.use(cors());
app.use(express.json());

// --- Authentication Middleware ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.status(401).json({ error: 'Unauthorized: No token provided' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: 'Forbidden: Invalid token' });
        req.user = user;
        next();
    });
};

const isValidEmail = (email) => typeof email === 'string' && /^\S+@\S+\.\S+$/.test(email);
const isValidSalary = (salary) => !Number.isNaN(Number(salary)) && Number(salary) >= 0;
const validateEmployeePayload = (payload, requirePassword = false) => {
    const { name, email, position, department, salary, password } = payload;
    if (!name || !email || !position || !department) {
        return 'Name, email, position and department are required.';
    }
    if (!isValidEmail(email)) {
        return 'A valid email address is required.';
    }
    if (!isValidSalary(salary)) {
        return 'Salary must be a valid non-negative number.';
    }
    if (requirePassword && !password) {
        return 'Password is required when creating a new employee account.';
    }
    if (password && password.length < 6) {
        return 'Password must be at least 6 characters long.';
    }
    return null;
};

// --- AUTH ROUTES ---
// Register Admin User
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'Username already exists' });
                }
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ message: 'User registered successfully', userId: this.lastID });
        });
    } catch (error) {
        res.status(500).json({ error: 'Error processing registration' });
    }
});

// Login Admin User
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(400).json({ error: 'Invalid username or password' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid username or password' });

        const token = jwt.sign({ id: user.id, username: user.username, role: 'admin' }, SECRET_KEY, { expiresIn: '12h' });
        res.json({ message: 'Login successful', token, username: user.username, role: 'admin' });
    });
});

// Login Employee Profile
app.post('/api/employee-login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    db.get('SELECT * FROM employees WHERE email = ?', [email], async (err, employee) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!employee) return res.status(400).json({ error: 'Invalid email or password' });

        const isMatch = await bcrypt.compare(password, employee.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid email or password' });

        const token = jwt.sign({ id: employee.id, email: employee.email, role: 'employee' }, SECRET_KEY, { expiresIn: '12h' });
        res.json({ message: 'Login successful', token, name: employee.name, role: 'employee' });
    });
});

// --- EMPLOYEE CRUD ROUTES ---

// Get self profile
app.get('/api/employees/me', authenticateToken, (req, res) => {
    if (req.user.role !== 'employee') return res.status(403).json({ error: 'Employees only' });
    db.get('SELECT id, name, email, position, department, salary FROM employees WHERE id = ?', [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Employee not found' });
        res.json(row);
    });
});

// Create Employee
app.post('/api/employees', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only can perform this action' });

    const validationError = validateEmployeePayload(req.body, true);
    if (validationError) return res.status(400).json({ error: validationError });

    const { name, email, position, department, salary, password } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(
            'INSERT INTO employees (name, email, position, department, salary, password) VALUES (?, ?, ?, ?, ?, ?)',
            [name.trim(), email.trim().toLowerCase(), position.trim(), department.trim(), Number(salary), hashedPassword],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ error: 'Email already exists' });
                    }
                    return res.status(500).json({ error: err.message });
                }
                res.status(201).json({ id: this.lastID, name, email, position, department, salary: Number(salary) });
            }
        );
    } catch (err) {
        res.status(500).json({ error: 'Error generating password' });
    }
});

// Read All Employees
app.get('/api/employees', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only can perform this action' });
    
    db.all('SELECT id, name, email, position, department, salary FROM employees ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Update Employee
app.put('/api/employees/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only can perform this action' });

    const validationError = validateEmployeePayload(req.body, false);
    if (validationError) return res.status(400).json({ error: validationError });

    const { name, email, position, department, salary, password } = req.body;
    try {
        let query = 'UPDATE employees SET name = ?, email = ?, position = ?, department = ?, salary = ?';
        const params = [name.trim(), email.trim().toLowerCase(), position.trim(), department.trim(), Number(salary)];

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += ', password = ?';
            params.push(hashedPassword);
        }

        query += ' WHERE id = ?';
        params.push(req.params.id);

        db.run(query, params, function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'Email already exists' });
                }
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) return res.status(404).json({ error: 'Employee not found' });
            res.json({ message: 'Employee updated successfully', id: req.params.id, name, email, position, department, salary: Number(salary) });
        });
    } catch (err) {
        res.status(500).json({ error: 'Error updating employee credentials' });
    }
});

// Delete Employee
app.delete('/api/employees/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only can perform this action' });

    db.run('DELETE FROM employees WHERE id = ?', [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Employee not found' });
        res.json({ message: 'Employee deleted successfully' });
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
