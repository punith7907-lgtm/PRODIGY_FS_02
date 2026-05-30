const API_URL = 'http://localhost:5000/api';
const LOCAL_MODE = !['http:', 'https:'].includes(window.location.protocol);
const LOCAL_DATA_KEY = 'emsLocalData';

// --- State Variables ---
let memoryStorage = {};
const safeGet = (key) => { try { return localStorage.getItem(key); } catch(e) { return memoryStorage[key] || null; } };
const safeSet = (key, val) => { try { localStorage.setItem(key, val); } catch(e) { memoryStorage[key] = val; } };
const safeRemove = (key) => { try { localStorage.removeItem(key); } catch(e) { delete memoryStorage[key]; } };
const safeClear = () => { try { localStorage.clear(); } catch(e) { memoryStorage = {}; } };

let currentRole = safeGet('role');
let currentToken = safeGet('token');
let currentUsername = safeGet('username');
let currentUserId = safeGet('userId');

const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getLocalData = () => {
    const stored = safeGet(LOCAL_DATA_KEY);
    if (!stored) return initLocalData();
    try {
        return JSON.parse(stored);
    } catch {
        return initLocalData();
    }
};

const initLocalData = () => {
    const data = {
        users: [
            { id: 1, username: 'admin', password: 'admin123' }
        ],
        employees: []
    };
    saveLocalData(data);
    return data;
};

const saveLocalData = (data) => {
    safeSet(LOCAL_DATA_KEY, JSON.stringify(data));
};

const getNextId = (items) => {
    if (!items || items.length === 0) return 1;
    return Math.max(...items.map(item => item.id)) + 1;
};

const localRequest = async (endpoint, options = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body ? JSON.parse(options.body) : null;
    const data = getLocalData();
    const path = endpoint.replace(/^\/+/, '');
    const segments = path.split('/');

    const handleLogin = () => {
        if (!body || !body.username || !body.password) throw new Error('Username and password required');
        const user = data.users.find(u => u.username === body.username);
        if (!user || user.password !== body.password) throw new Error('Invalid username or password');
        return { message: 'Login successful', token: `local-token-${Date.now()}`, username: user.username, role: 'admin', userId: user.id };
    };

    const handleEmployeeLogin = () => {
        if (!body || !body.email || !body.password) throw new Error('Email and password required');
        const employee = data.employees.find(emp => emp.email === body.email);
        if (!employee || employee.password !== body.password) throw new Error('Invalid email or password');
        return { message: 'Login successful', token: `local-token-${Date.now()}`, name: employee.name, role: 'employee', userId: employee.id };
    };

    const ensureAdmin = () => {
        if (currentRole !== 'admin') throw new Error('Admins only can perform this action');
    };

    const errorIf = (condition, message) => { if (condition) throw new Error(message); };

    if (path === 'register' && method === 'POST') {
        if (!body || !body.username || !body.password) throw new Error('Username and password required');
        if (body.password.length < 6) throw new Error('Password must be at least 6 characters long');
        if (data.users.some(u => u.username === body.username)) throw new Error('Username already exists');
        const newUser = { id: getNextId(data.users), username: body.username, password: body.password };
        data.users.push(newUser);
        saveLocalData(data);
        return { message: 'User registered successfully', userId: newUser.id };
    }

    if (path === 'login' && method === 'POST') {
        return handleLogin();
    }

    if (path === 'employee-login' && method === 'POST') {
        return handleEmployeeLogin();
    }

    if (path === 'employees/me' && method === 'GET') {
        if (currentRole !== 'employee') throw new Error('Employees only');
        const userId = Number(currentUserId);
        const employee = data.employees.find(emp => emp.id === userId);
        if (!employee) throw new Error('Employee not found');
        const { password, ...profile } = employee;
        return profile;
    }

    if (segments[0] === 'employees' && segments.length === 1) {
        if (method === 'GET') {
            ensureAdmin();
            return data.employees.map(({ password, ...rest }) => rest);
        }
        if (method === 'POST') {
            ensureAdmin();
            if (!body) throw new Error('Employee data required');
            const { name, email, position, department, salary, password } = body;
            errorIf(!name || !email || !position || !department || !salary, 'Name, email, position, department and salary are required');
            if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('A valid email address is required');
            if (Number.isNaN(Number(salary)) || Number(salary) < 0) throw new Error('Salary must be a valid non-negative number');
            if (!password || password.length < 6) throw new Error('Password must be at least 6 characters long');
            if (data.employees.some(emp => emp.email === email)) throw new Error('Email already exists');
            const newEmployee = { id: getNextId(data.employees), name, email, position, department, salary: Number(salary), password };
            data.employees.push(newEmployee);
            saveLocalData(data);
            const { password: _, ...result } = newEmployee;
            return result;
        }
    }

    if (segments[0] === 'employees' && segments.length === 2) {
        const id = Number(segments[1]);
        const employeeIndex = data.employees.findIndex(emp => emp.id === id);
        if (employeeIndex === -1) throw new Error('Employee not found');

        if (method === 'PUT') {
            ensureAdmin();
            if (!body) throw new Error('Employee data required');
            const { name, email, position, department, salary, password } = body;
            errorIf(!name || !email || !position || !department || !salary, 'Name, email, position, department and salary are required');
            if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('A valid email address is required');
            if (Number.isNaN(Number(salary)) || Number(salary) < 0) throw new Error('Salary must be a valid non-negative number');
            if (data.employees.some(emp => emp.email === email && emp.id !== id)) throw new Error('Email already exists');
            const employee = data.employees[employeeIndex];
            employee.name = name;
            employee.email = email;
            employee.position = position;
            employee.department = department;
            employee.salary = Number(salary);
            if (password) employee.password = password;
            saveLocalData(data);
            const { password: _, ...result } = employee;
            return result;
        }

        if (method === 'DELETE') {
            ensureAdmin();
            data.employees.splice(employeeIndex, 1);
            saveLocalData(data);
            return { message: 'Employee deleted successfully' };
        }
    }

    throw new Error('Endpoint not supported in local mode');
};

// --- API Helpers ---
const fetchAPI = async (endpoint, options = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (currentToken) headers['Authorization'] = `Bearer ${currentToken}`;
    
    const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'API Error');
    return data;
};

const apiRequest = async (endpoint, options = {}) => {
    if (LOCAL_MODE) return localRequest(endpoint, options);
    try {
        return await fetchAPI(endpoint, options);
    } catch (err) {
        const isNetworkError = err instanceof TypeError || /failed to fetch/i.test(err.message);
        if (isNetworkError) {
            return localRequest(endpoint, options);
        }
        throw err;
    }
};

// --- DOM Router ---
const appDiv = document.getElementById('app');

function navigate() {
    if (!currentToken) return renderLogin();
    if (currentRole === 'admin') return renderAdminDashboard();
    return renderEmployeeDashboard();
}
window.navigate = navigate;

function handleLogout() {
    safeRemove('token');
    safeRemove('role');
    safeRemove('username');
    safeRemove('userId');
    currentToken = null;
    currentRole = null;
    currentUsername = null;
    currentUserId = null;
    navigate();
}
window.handleLogout = handleLogout;

// --- View: Login ---
function renderLogin(mode = 'employee', authAction = 'login') {
    const isAdmin = mode === 'admin';
    const isRegister = isAdmin && authAction === 'register';

    appDiv.innerHTML = `
        <div class="auth-container">
            <div class="glass-panel auth-card">
                <div style="margin-bottom: 2rem;">
                    <h1 class="auth-title">Welcome Back</h1>
                    <p style="color: var(--text-muted)">Sign in to your Portal</p>
                </div>
                
                <div style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem; background: rgba(15,23,42,0.6); padding: 0.25rem; border-radius: 8px;">
                    <button class="btn" onclick="renderLogin('employee')" style="flex:1; background: ${mode === 'employee' ? 'var(--primary-color)' : 'transparent'}; color: ${mode === 'employee' ? 'white' : 'var(--text-muted)'}">Employee</button>
                    <button class="btn" onclick="renderLogin('admin','login')" style="flex:1; background: ${isAdmin ? 'var(--primary-color)' : 'transparent'}; color: ${isAdmin ? 'white' : 'var(--text-muted)'}">Admin (HR)</button>
                </div>

                <div id="authError" class="auth-error" style="display: none;"></div>

                <form id="loginForm">
                    <div class="form-group">
                        <label class="form-label">${isAdmin ? 'Admin Username' : 'Employee Email'}</label>
                        <input id="usernameInput" type="${isAdmin ? 'text' : 'email'}" class="form-input" required />
                    </div>
                    <div class="form-group">
                        <label class="form-label">Password</label>
                        <input id="passwordInput" type="password" class="form-input" required />
                    </div>
                    ${isRegister ? `
                    <div class="form-group">
                        <label class="form-label">Confirm Password</label>
                        <input id="confirmPasswordInput" type="password" class="form-input" required />
                    </div>
                    ` : ''}
                    <button type="submit" class="btn btn-primary" style="width: 100%">${isRegister ? 'Register Admin' : 'Sign In'}</button>
                    
                    ${isAdmin ? `
                    <div style="margin-top: 1rem; color: var(--text-muted); font-size: 0.85rem">
                       ${isRegister ? `Already have an admin account? <a href="#" onclick="renderLogin('admin','login'); return false;" style="color: var(--primary-color);">Sign in</a>` : `First time Admin? <a href="#" onclick="renderLogin('admin','register'); return false;" style="color: var(--primary-color);">Create an admin account</a>`}
                    </div>
                    ` : ''}
                </form>
            </div>
        </div>
    `;

    document.getElementById('loginForm').onsubmit = async (e) => {
        e.preventDefault();
        const ident = document.getElementById('usernameInput').value.trim();
        const pass = document.getElementById('passwordInput').value;
        const errorDiv = document.getElementById('authError');

        errorDiv.style.display = 'none';

        if (isRegister) {
            const confirmPass = document.getElementById('confirmPasswordInput').value;
            if (pass !== confirmPass) {
                errorDiv.style.display = 'block';
                errorDiv.innerText = 'Passwords do not match';
                return;
            }
        }
        
        try {
            const endpoint = isAdmin ? (isRegister ? '/register' : '/login') : '/employee-login';
            const payload = isAdmin ? { username: ident, password: pass } : { email: ident, password: pass };

            const data = await apiRequest(endpoint, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (!isRegister) {
                safeSet('token', data.token);
                safeSet('role', data.role);
                safeSet('username', data.username || data.name || ident);
                if (data.userId) safeSet('userId', data.userId);
                currentToken = data.token;
                currentRole = data.role;
                currentUsername = data.username || data.name || ident;
                currentUserId = data.userId || currentUserId;
                navigate();
            } else {
                alert('Admin registered successfully. Please sign in now.');
                renderLogin('admin', 'login');
            }
        } catch (err) {
            errorDiv.style.display = 'block';
            errorDiv.innerText = err.message;
        }
    };
}
window.renderLogin = renderLogin;

// --- View: Admin Dashboard ---
function renderAdminDashboard() {
    appDiv.innerHTML = `
        <div class="dashboard-container">
            <nav class="glass-panel" style="border-radius:0; border-top:none; border-left:none; border-right:none; display:flex; justify-content:space-between; padding: 1rem 2rem; align-items:center;">
                <div style="font-size: 1.5rem; font-weight: bold; background: linear-gradient(to right, #fff, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">ProDigy HR Admin</div>
                <div style="display:flex; align-items:center; gap: 1.5rem;">
                    <span>Welcome, <span style="color:#c084fc; font-weight:600;">${currentUsername}</span></span>
                    <button class="btn" onclick="handleLogout()" style="border: 1px solid var(--border-color); background: transparent; color: white;">Logout</button>
                </div>
            </nav>
            <main class="main-content">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 2rem;">
                    <div>
                        <h1 style="font-size: 1.8rem; font-weight: 700;">Employee Directory</h1>
                        <p style="color: var(--text-muted)">Manage workforce records</p>
                    </div>
                    <button class="btn btn-primary" onclick="openAdminModal()">+ Add Employee</button>
                </div>
                <div id="tableContainer" class="glass-panel table-container">
                    <p style="padding: 2rem; text-align: center;">Loading...</p>
                </div>
            </main>
            <div id="modalContainer"></div>
        </div>
    `;
    loadEmployees();
}
window.renderAdminDashboard = renderAdminDashboard;

async function loadEmployees() {
    try {
        const emps = await apiRequest('/employees');
        let html = `<table><thead><tr><th>Name</th><th>Email</th><th>Position</th><th>Department</th><th>Salary</th><th>Actions</th></tr></thead><tbody>`;
        if (emps.length === 0) html += `<tr><td colspan="6" style="text-align:center;">No employees found.</td></tr>`;
        
        emps.forEach(emp => {
            const employeeData = encodeURIComponent(JSON.stringify(emp));
            html += `
                <tr>
                    <td style="font-weight: 500">${emp.name}</td>
                    <td>${emp.email}</td>
                    <td><span class="badge">${emp.position}</span></td>
                    <td>${emp.department}</td>
                    <td>$${emp.salary.toLocaleString()}</td>
                    <td>
                        <button class="btn-icon edit-btn" data-employee="${employeeData}">Edit</button>
                        <button class="btn-icon" style="color:var(--danger-color)" onclick="deleteEmployee(${emp.id})">Delete</button>
                    </td>
                </tr>
            `;
        });
        html += `</tbody></table>`;
        document.getElementById('tableContainer').innerHTML = html;

        document.querySelectorAll('.edit-btn').forEach(button => {
            button.addEventListener('click', () => {
                const emp = JSON.parse(decodeURIComponent(button.dataset.employee));
                openAdminModal(emp.id, emp.name, emp.email, emp.position, emp.department, emp.salary);
            });
        });
    } catch (err) {
        if (err.message.includes('Forbidden') || err.message.includes('Unauthorized')) handleLogout();
        else document.getElementById('tableContainer').innerHTML = `<p style="padding:2rem; color:red;">${err.message}</p>`;
    }
}
window.loadEmployees = loadEmployees;

async function deleteEmployee(id) {
    if (!confirm('Are you sure you want to delete this employee?')) return;
    try {
        await apiRequest(`/employees/${id}`, { method: 'DELETE' });
        loadEmployees();
    } catch (err) {
        alert(err.message);
    }
}
window.deleteEmployee = deleteEmployee;

function openAdminModal(id = null, name = '', email = '', position = '', department = '', salary = '') {
    document.getElementById('modalContainer').innerHTML = `
        <div class="modal-overlay">
            <div class="glass-panel modal-content">
                <div class="modal-header">
                    <h2>${id ? 'Edit Employee' : 'Add Employee'}</h2>
                    <button class="close-btn" type="button" onclick="document.getElementById('modalContainer').innerHTML = ''">×</button>
                </div>
                <form id="employeeForm">
                    <div class="form-group"><label class="form-label">Name</label><input type="text" id="empName" class="form-input" value="${escapeHtml(name)}" required /></div>
                    <div class="form-group"><label class="form-label">Email</label><input type="email" id="empEmail" class="form-input" value="${escapeHtml(email)}" required /></div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                        <div class="form-group"><label class="form-label">Position</label><input type="text" id="empPos" class="form-input" value="${escapeHtml(position)}" required /></div>
                        <div class="form-group"><label class="form-label">Department</label><input type="text" id="empDep" class="form-input" value="${escapeHtml(department)}" required /></div>
                    </div>
                    <div class="form-group"><label class="form-label">Salary</label><input type="number" id="empSal" class="form-input" value="${escapeHtml(salary)}" required min="0" step="0.01" /></div>
                    <div class="form-group"><label class="form-label">Password</label><input type="password" id="empPass" class="form-input" placeholder="${id ? 'Leave blank to keep current password' : 'Create a strong password'}" ${id ? '' : 'required'} /></div>
                    <div style="display:flex; justify-content:flex-end; gap:1rem; margin-top:2rem;">
                        <button type="button" class="btn" style="border: 1px solid var(--border-color); background: transparent; color: white;" onclick="document.getElementById('modalContainer').innerHTML = ''">Cancel</button>
                        <button type="submit" class="btn btn-primary">Save</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.getElementById('employeeForm').onsubmit = async (e) => {
        e.preventDefault();
        const payload = {
            name: document.getElementById('empName').value.trim(),
            email: document.getElementById('empEmail').value.trim(),
            position: document.getElementById('empPos').value.trim(),
            department: document.getElementById('empDep').value.trim(),
            salary: document.getElementById('empSal').value,
            password: document.getElementById('empPass').value.trim(),
        };

        if (!payload.name || !payload.email || !payload.position || !payload.department) {
            return alert('Please fill in all required fields.');
        }
        if (!payload.salary || Number(payload.salary) < 0) {
            return alert('Salary must be a valid non-negative amount.');
        }
        if (!id && !payload.password) {
            return alert('A password is required for a new employee account.');
        }

        if (id && !payload.password) {
            delete payload.password;
        }

        try {
            if (id) await apiRequest(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
            else await apiRequest(`/employees`, { method: 'POST', body: JSON.stringify(payload) });
            document.getElementById('modalContainer').innerHTML = '';
            loadEmployees();
        } catch(err) {
            alert(err.message);
        }
    };
}
window.openAdminModal = openAdminModal;

// --- View: Employee Dashboard ---
async function renderEmployeeDashboard() {
    appDiv.innerHTML = `
        <div class="dashboard-container">
            <nav class="glass-panel" style="border-radius:0; border-top:none; border-left:none; border-right:none; display:flex; justify-content:space-between; padding: 1rem 2rem; align-items:center;">
                <div style="font-size: 1.5rem; font-weight: bold; background: linear-gradient(to right, #fff, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">ProDigy Employee Portal</div>
                <div style="display:flex; align-items:center; gap: 1.5rem;">
                    <span>Hello, <span style="color:#06b6d4; font-weight:600;">${currentUsername}</span></span>
                    <button class="btn" onclick="handleLogout()" style="border: 1px solid var(--border-color); background: transparent; color: white;">Logout</button>
                </div>
            </nav>
            <main class="main-content" style="display:flex; justify-content:center; padding-top: 3rem;">
                <div style="width: 100%; max-width: 600px;">
                    <h1 style="text-align:center; font-size: 1.8rem; font-weight: 700; margin-bottom: 2rem;">My Profile</h1>
                    <div id="profileContainer" class="glass-panel" style="padding: 2.5rem; text-align:center;">Loading profile...</div>
                </div>
            </main>
        </div>
    `;

    try {
        const emp = await apiRequest('/employees/me');
        document.getElementById('profileContainer').innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; margin-bottom: 2rem; border-bottom: 1px solid var(--border-color); padding-bottom: 2rem;">
                <div style="width: 80px; height: 80px; border-radius: 50%; background: rgba(6,182,212,0.2); display:flex; align-items:center; justify-content:center; margin-bottom: 1rem; font-size: 2rem; font-weight:bold; color: #2dd4bf;">
                    ${emp.name.charAt(0)}
                </div>
                <h2 style="font-size: 1.5rem;">${emp.name}</h2>
                <span class="badge" style="margin-top: 0.5rem; background: rgba(6,182,212,0.1); color: #2dd4bf;">${emp.position}</span>
            </div>
            <div style="display:grid; gap: 1rem; text-align:left;">
                <div style="background: rgba(15,23,42,0.4); padding: 1rem; border-radius: 8px;">
                    <div style="font-size:0.8rem; color:var(--text-muted);">Email Address</div>
                    <div style="font-weight:500;">${emp.email}</div>
                </div>
                <div style="background: rgba(15,23,42,0.4); padding: 1rem; border-radius: 8px;">
                    <div style="font-size:0.8rem; color:var(--text-muted);">Department</div>
                    <div style="font-weight:500;">${emp.department}</div>
                </div>
                <div style="background: rgba(15,23,42,0.4); padding: 1rem; border-radius: 8px;">
                    <div style="font-size:0.8rem; color:var(--text-muted);">Current Salary</div>
                    <div style="font-weight:500;">$${emp.salary.toLocaleString()}</div>
                </div>
            </div>
        `;
    } catch(err) {
        if (err.message.includes('Forbidden') || err.message.includes('Unauthorized')) handleLogout();
        else document.getElementById('profileContainer').innerHTML = `<span style="color:red;">${err.message}</span>`;
    }
}
window.renderEmployeeDashboard = renderEmployeeDashboard;

// --- Initialization ---
navigate();
