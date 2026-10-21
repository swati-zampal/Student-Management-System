
const $ = (s, root = document) => root.querySelector(s);

const state = {
    user: null,
    csrf: '',
    view: 'dashboard',
    rows: [],
    courses: [],
    batches: [],
    students: [],
    enrollments: []
};

const titles = {
    dashboard: 'Dashboard',
    students: 'Students',
    courses: 'Courses',
    batches: 'Batches',
    attendance: 'Attendance',
    fees: 'Fees',
    results: 'Results',
    reports: 'Reports'
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;'
}[c]));

const money = value => new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
}).format(Number(value || 0));

function notice(message, bad = false) {
    const el = $('#notice');
    el.textContent = message;
    el.classList.remove('hidden', 'error');
    if (bad) el.classList.add('error');
    setTimeout(() => el.classList.add('hidden'), 4500);
}

async function api(action, data = null, method = null) {
    const requestMethod = method || (data ? 'POST' : 'GET');
    const options = { method: requestMethod, headers: {} };

    if (data) {
        options.headers['Content-Type'] = 'application/json';
        options.headers['X-CSRF-Token'] = state.csrf;
        options.body = JSON.stringify(data);
    }

    const response = await fetch(
        '/api/index.php?action=' + encodeURIComponent(action),
        options
    );

    const result = await response.json().catch(() => ({
        error: 'Invalid server response'
    }));

    if (response.status === 401) {
        location.href = '/login.html';
        throw new Error('Please sign in again');
    }

    if (!response.ok) {
        throw new Error(result.error || 'Request failed');
    }

    if (result.csrf) state.csrf = result.csrf;
    return result;
}

function button(text, action, cls = 'secondary') {
    return `<button type="button" class="${cls}"
        data-action="${esc(action)}">${esc(text)}</button>`;
}

function shell(title, subtitle, content) {
    return `<div class="panel">
        <div class="panel-head"><div>
            <h2>${title}</h2><p>${subtitle || ''}</p>
        </div></div>${content}</div>`;
}

function field(name, label, type = 'text', required = true, value = '', opts = '') {
    if (type === 'select') {
        return `<div><label>${label}</label>
            <select name="${name}" ${required ? 'required' : ''}>
                ${opts}
            </select></div>`;
    }

    return `<div><label>${label}</label>
        <input name="${name}" type="${type}" value="${esc(value)}"
            ${required ? 'required' : ''}
            ${type === 'number' ? 'step="0.01" min="0"' : ''}>
        </div>`;
}

function selectOpts(items, valueField, labelFn, selected = '') {
    return '<option value="">Select…</option>' + items.map(item =>
        `<option value="${esc(item[valueField])}"
        ${String(item[valueField]) === String(selected) ? 'selected' : ''}>
        ${esc(labelFn(item))}</option>`
    ).join('');
}

function table(headers, rows) {
    return `<div class="table-wrap"><table>
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rows || '<tr><td colspan="10" class="empty">No records found</td></tr>'}</tbody>
    </table></div>`;
}

async function loadLookups() {
    const [students, courses, batches, enrollments] = await Promise.all([
        api('students'),
        api('courses'),
        api('batches'),
        api('enrollments')
    ]);

    state.students = students.data;
    state.courses = courses.data;
    state.batches = batches.data;
    state.enrollments = enrollments.data;
}

async function render() {
    $('#pageTitle').textContent = titles[state.view] || 'Dashboard';

    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
        item.classList.toggle('active', item.dataset.view === state.view);
    });

    const target = $('#view');
    target.innerHTML = '<div class="panel">Loading…</div>';

    try {
        if (state.view === 'dashboard') {
            target.innerHTML = dashboard(await api('dashboard'));
        } else if (state.view === 'students') {
            const result = await api('students');
            state.rows = result.data;
            target.innerHTML = studentsPage(result.data);
        } else if (state.view === 'courses') {
            const result = await api('courses');
            state.rows = result.data;
            target.innerHTML = coursesPage(result.data);
        } else if (state.view === 'batches') {
            await loadLookups();
            target.innerHTML = batchesPage(state.batches);
        } else if (state.view === 'attendance') {
            await loadLookups();
            target.innerHTML = attendancePage((await api('attendance')).data);
        } else if (state.view === 'fees') {
            await loadLookups();
            target.innerHTML = feesPage((await api('fees')).data);
        } else if (state.view === 'results') {
            await loadLookups();
            target.innerHTML = resultsPage((await api('results')).data);
        } else if (state.view === 'reports') {
            target.innerHTML = reportsPage((await api('report')).data);
        }
    } catch (error) {
        target.innerHTML = `<div class="panel"><p class="error">${esc(error.message)}</p></div>`;
    }
}

function dashboard(data) {
    return `<div class="stats">
        <div class="stat"><label>Total students</label><strong>${data.students}</strong></div>
        <div class="stat"><label>Courses</label><strong>${data.courses}</strong></div>
        <div class="stat"><label>Active batches</label><strong>${data.batches}</strong></div>
        <div class="stat"><label>Fees collected</label><strong>${money(data.collected)}</strong></div>
    </div>
    ${shell('Recent registrations', 'Latest students added to the system',
        table(['Roll no.', 'Student', 'Email', 'Joined', 'Status'],
        data.recent.map(s => `<tr>
            <td>${esc(s.roll_no)}</td><td>${esc(s.full_name)}</td>
            <td>${esc(s.email)}</td><td>${esc(s.joined_on)}</td>
            <td><span class="pill ${esc(s.status)}">${esc(s.status)}</span></td>
        </tr>`).join('')))}
    ${shell('Quick actions', 'Choose a module from the left navigation',
        `<div class="toolbar">
            ${button('Register student', 'new-student', 'primary')}
            ${button('Add course', 'new-course')}
            ${button('Record payment', 'new-payment')}
        </div>`)}
    `;
}

function studentRows(data) {
    return table(
        ['Roll no.', 'Student', 'Email', 'Phone', 'Joined', 'Status', 'Actions'],
        data.map(s => `<tr
            data-search="${esc((s.roll_no+' '+s.full_name+' '+s.email+' '+s.phone+' '+s.status).toLowerCase())}"
            data-status="${esc(s.status)}">
            <td>${esc(s.roll_no)}</td><td><b>${esc(s.full_name)}</b></td>
            <td>${esc(s.email)}</td><td>${esc(s.phone)}</td>
            <td>${esc(s.joined_on)}</td>
            <td><span class="pill ${esc(s.status)}">${esc(s.status)}</span></td>
            <td><div class="table-actions">
                ${button('Edit', 'edit-student:'+s.id)}
                ${button('Delete', 'delete-student:'+s.id, 'danger')}
            </div></td>
        </tr>`).join('')
    );
}

function studentsPage(data) {
    return shell('Student directory', 'Register and maintain student profiles',
        `<div class="toolbar">
            <input id="filter" placeholder="Search name, roll no., email or phone">
            <select id="statusFilter">
                <option value="">All statuses</option>
                <option>active</option><option>inactive</option><option>completed</option>
            </select>
            ${button('＋ Add student', 'new-student', 'primary')}
        </div><div id="studentTable">${studentRows(data)}</div>`
    );
}

function coursesPage(data) {
    const rows = data.map(c => `<tr data-search="${esc((c.course_name+' '+c.description).toLowerCase())}">
        <td><b>${esc(c.course_name)}</b><br><small>${esc(c.description)}</small></td>
        <td>${c.duration_weeks} weeks</td><td>${money(c.fee)}</td>
        <td><div class="table-actions">
            ${button('Edit', 'edit-course:'+c.id)}
            ${button('Delete', 'delete-course:'+c.id, 'danger')}
        </div></td></tr>`).join('');

    return shell('Course catalogue', 'Manage course duration and fees',
        `<div class="toolbar"><input id="filter" placeholder="Search courses">
        ${button('＋ Add course', 'new-course', 'primary')}</div>
        <div id="courseTable">${table(['Course','Duration','Course fee','Actions'], rows)}</div>`
    );
}

function batchesPage(data) {
    const rows = data.map(b => `<tr>
        <td>${esc(b.batch_name)}</td><td>${esc(b.course_name)}</td>
        <td>${esc(b.trainer_name)}</td><td>${esc(b.start_date)}</td>
        <td>${esc(b.end_date)}</td><td>${esc(b.schedule)}</td>
        <td>${button('Delete', 'delete-batch:'+b.id, 'danger')}</td>
    </tr>`).join('');

    return shell('Training batches', 'Manage courses, trainers and schedules',
        `<div class="toolbar">
            ${button('＋ Add batch', 'new-batch', 'primary')}
            ${button('＋ Enroll student', 'new-enrollment')}
        </div>${table(['Batch','Course','Trainer','Start date','End date','Schedule','Actions'], rows)}`
    );
}

function enrollmentOpts() {
    return selectOpts(state.enrollments, 'id',
        e => `${e.full_name} — ${e.batch_name} (${e.roll_no})`);
}

function attendancePage(data) {
    return shell('Attendance register', 'Record attendance by student and date',
        `<form id="attendanceForm"><div class="field-grid">
            ${field('enrollment_id','Student / batch','select',true,'',enrollmentOpts())}
            ${field('attendance_date','Date','date',true,new Date().toISOString().slice(0,10))}
            ${field('status','Status','select',true,'',
                '<option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="excused">Excused</option>')}
            ${field('notes','Notes','text',false)}
        </div><div class="form-actions"><button class="primary">Save attendance</button></div></form>
        <hr>${table(['Date','Student','Batch','Status','Notes'],data.map(a=>`<tr>
            <td>${esc(a.attendance_date)}</td><td>${esc(a.full_name)}</td>
            <td>${esc(a.batch_name)}</td><td><span class="pill ${esc(a.status)}">${esc(a.status)}</span></td>
            <td>${esc(a.notes)}</td></tr>`).join(''))}`
    );
}

function feesPage(data) {
    return shell('Fee tracking', 'Record payments and view outstanding balances',
        `<form id="paymentForm"><div class="field-grid">
            ${field('enrollment_id','Student / batch','select',true,'',enrollmentOpts())}
            ${field('amount','Payment amount (₹)','number')}
            ${field('payment_date','Payment date','date',true,new Date().toISOString().slice(0,10))}
            ${field('method','Payment method','select',true,'',
                '<option value="upi">UPI</option><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="other">Other</option>')}
            ${field('reference_no','Reference number','text',false)}
            ${field('notes','Notes','text',false)}
        </div><div class="form-actions"><button class="primary">Record payment</button></div></form>
        <hr>${table(['Student','Batch','Agreed fee','Paid','Balance','Date','Method','Reference'],
            data.map(f=>`<tr><td>${esc(f.full_name)}</td><td>${esc(f.batch_name)}</td>
                <td>${money(f.agreed_fee)}</td><td>${money(f.paid)}</td>
                <td>${money(f.balance)}</td><td>${esc(f.payment_date)}</td>
                <td>${esc(f.method)}</td><td>${esc(f.reference_no)}</td></tr>`).join(''))}`
    );
}

function resultsPage(data) {
    return shell('Assessment results', 'Enter marks for enrolled students',
        `<form id="resultForm"><div class="field-grid">
            ${field('enrollment_id','Student / batch','select',true,'',enrollmentOpts())}
            ${field('assessment_name','Assessment name')}
            ${field('marks_obtained','Marks obtained','number')}
            ${field('total_marks','Total marks','number')}
            ${field('assessment_date','Assessment date','date',true,new Date().toISOString().slice(0,10))}
            ${field('remarks','Remarks','text',false)}
        </div><div class="form-actions"><button class="primary">Save result</button></div></form>
        <hr>${table(['Student','Batch','Assessment','Marks','Percentage','Date','Remarks'],
        data.map(r=>`<tr><td>${esc(r.full_name)}</td><td>${esc(r.batch_name)}</td>
            <td>${esc(r.assessment_name)}</td><td>${r.marks_obtained}/${r.total_marks}</td>
            <td>${Number(r.total_marks)>0?(100*r.marks_obtained/r.total_marks).toFixed(1):'0'}%</td>
            <td>${esc(r.assessment_date)}</td><td>${esc(r.remarks)}</td></tr>`).join(''))}`
    );
}

function reportsPage(data) {
    return shell('Reports & exports', 'Registration, fee and result summaries',
        `<div class="stats">
            <div class="stat"><label>Registrations</label><strong>${data.students}</strong></div>
            <div class="stat"><label>Agreed fees</label><strong>${money(data.agreed)}</strong></div>
            <div class="stat"><label>Collected</label><strong>${money(data.collected)}</strong></div>
            <div class="stat"><label>Outstanding</label><strong>${money(data.balance)}</strong></div>
        </div><div class="toolbar">
            ${button('Download fee report (CSV)','export-fees','primary')}
            ${button('Download student report (CSV)','export-students')}
            ${button('Download results report (CSV)','export-results')}
        </div>`
    );
}

function showForm(title, fields, values = {}, saveAction, id = null) {
    const html = `<div class="panel">
        <div class="panel-head"><h2>${title}</h2>${button('Cancel','close-modal')}</div>
        <form id="editForm"><div class="field-grid">
        ${fields.map(f=>field(f[0],f[1],f[2]||'text',f[3]!==false,values[f[0]]??f[4]??'',f[5]||'')).join('')}
        </div><div class="form-actions"><button class="primary">Save record</button></div>
        <p class="error" id="formError"></p></form></div>`;

    const modal = document.createElement('div');
    modal.id = 'modal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `<div class="modal-content">${html}</div>`;
    document.body.appendChild(modal);

    $('#editForm', modal).addEventListener('submit', async event => {
        event.preventDefault();
        const payload = Object.fromEntries(new FormData(event.target).entries());

        try {
            await api(saveAction, { ...payload, id });
            modal.remove();
            notice('Record saved successfully');
            await render();
        } catch (error) {
            $('#formError', modal).textContent = error.message;
        }
    });
}

async function action(a) {
    if (a === 'close-modal') {
        $('#modal')?.remove();
        return;
    }

    if (a === 'new-student' || a.startsWith('edit-student:')) {
        const editing = a.startsWith('edit-');
        const values = editing ? state.rows.find(s=>s.id==a.split(':')[1]) || {} : {};

        showForm(editing ? 'Edit student' : 'Register student', [
            ['roll_no','Roll number'],
            ['full_name','Full name'],
            ['email','Email','email',false],
            ['phone','Phone','text',false],
            ['address','Address','text',false],
            ['joined_on','Joining date','date',true,new Date().toISOString().slice(0,10)],
            ['status','Status','select',true,'',
                '<option>active</option><option>inactive</option><option>completed</option>']
        ], values, 'save-student', values.id || null);
        return;
    }

    if (a === 'new-course' || a.startsWith('edit-course:')) {
        const editing = a.startsWith('edit-');
        const values = editing ? state.rows.find(c=>c.id==a.split(':')[1]) || {} : {};

        showForm(editing ? 'Edit course' : 'Add course', [
            ['course_name','Course name'],
            ['duration_weeks','Duration (weeks)','number'],
            ['fee','Course fee (₹)','number'],
            ['description','Description','text',false]
        ], values, 'save-course', values.id || null);
        return;
    }

    if (a === 'new-batch') {
        await loadLookups();
        showForm('Add batch', [
            ['course_id','Course','select',true,'',selectOpts(state.courses,'id',c=>c.course_name)],
            ['batch_name','Batch name'],
            ['trainer_name','Trainer name','text',false],
            ['start_date','Start date','date',true,new Date().toISOString().slice(0,10)],
            ['end_date','End date','date',false],
            ['schedule','Schedule','text',false]
        ], {}, 'save-batch');
        return;
    }

    if (a === 'new-enrollment') {
        await loadLookups();
        showForm('Enroll student in batch', [
            ['student_id','Student','select',true,'',selectOpts(state.students,'id',s=>`${s.full_name} — ${s.roll_no}`)],
            ['batch_id','Batch','select',true,'',selectOpts(state.batches,'id',b=>`${b.batch_name} — ${b.course_name}`)],
            ['enrolled_on','Enrollment date','date',true,new Date().toISOString().slice(0,10)],
            ['agreed_fee','Agreed course fee (₹)','number']
        ], {}, 'save-enrollment');
        return;
    }

    if (a === 'new-payment') {
        state.view = 'fees';
        await render();
        return;
    }

    if (a.startsWith('delete-')) {
        const [what, id] = a.split(':');
        if (!confirm('Delete this record? Related records may prevent deletion.')) return;

        const endpoint = {
            'delete-student': 'delete-student',
            'delete-course': 'delete-course',
            'delete-batch': 'delete-batch'
        }[what];

        try {
            await api(endpoint, { id });
            notice('Record deleted');
            await render();
        } catch (error) {
            notice(error.message, true);
        }
        return;
    }

    if (a.startsWith('export-')) {
        try {
            const response = await fetch('/api/index.php?action=' + a);
            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = a.replace('export-', '') + '-report.csv';
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            notice(error.message, true);
        }
    }
}

document.addEventListener('click', event => {
    const nav = event.target.closest('[data-view]');
    if (nav) {
        state.view = nav.dataset.view;
        render();
        return;
    }

    const btn = event.target.closest('[data-action]');
    if (btn) action(btn.dataset.action);
});

document.addEventListener('submit', async event => {
    const endpoints = {
        attendanceForm: 'save-attendance',
        paymentForm: 'save-payment',
        resultForm: 'save-result'
    };

    if (!endpoints[event.target.id]) return;
    event.preventDefault();

    const data = Object.fromEntries(new FormData(event.target).entries());

    try {
        await api(endpoints[event.target.id], data);
        notice('Record saved');
        await render();
    } catch (error) {
        notice(error.message, true);
    }
});

document.addEventListener('input', event => {
    if (event.target.id !== 'filter') return;

    const query = event.target.value.toLowerCase();
    document.querySelectorAll('tr[data-search]').forEach(row => {
        row.hidden = !row.dataset.search.includes(query);
    });
});

document.addEventListener('change', event => {
    if (event.target.id !== 'statusFilter') return;

    document.querySelectorAll('tr[data-status]').forEach(row => {
        row.hidden = !!event.target.value &&
            row.dataset.status !== event.target.value;
    });
});

$('#logoutBtn').addEventListener('click', async () => {
    try {
        await api('logout', {});
    } finally {
        location.href = '/login.html';
    }
});

async function init() {
    try {
        const result = await api('me');
        state.user = result.user;
        state.csrf = result.csrf;

        $('#userBadge').innerHTML =
            `${esc(result.user.name)}<small>${esc(result.user.role)}</small>`;

        $('#today').textContent = new Date().toLocaleDateString();
        await render();
    } catch (error) {
        location.href = '/login.html';
    }
}

init();
