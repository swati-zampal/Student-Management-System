<?php
declare(strict_types=1);

require_once __DIR__ . '/../../app/bootstrap.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function rows(string $sql, array $params = []): array {
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function row(string $sql, array $params = []): array|false {
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetch();
}

function id_value(mixed $value): int {
    $id = filter_var($value, FILTER_VALIDATE_INT);
    return $id && $id > 0 ? $id : 0;
}

function post_data(): array {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        json_out(['error' => 'Method not allowed'], 405);
    }
    require_csrf();
    return input_data();
}

function csrf_token(): string {
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

try {
    /* Authentication */
    if ($action === 'login') {
        if ($method !== 'POST') {
            json_out(['error' => 'Method not allowed'], 405);
        }

        $b = input_data();
        $email = filter_var($b['email'] ?? '', FILTER_VALIDATE_EMAIL);
        $password = (string)($b['password'] ?? '');

        if (!$email || $password === '') {
            json_out(['error' => 'Enter email and password'], 422);
        }

        $u = row(
            "SELECT id,name,email,password_hash,role,active
             FROM users WHERE email = ?",
            [$email]
        );

        if (!$u || !$u['active'] ||
            !password_verify($password, $u['password_hash'])) {
            json_out(['error' => 'Invalid credentials'], 401);
        }

        session_regenerate_id(true);

        $_SESSION['user'] = [
            'id' => (int)$u['id'],
            'name' => $u['name'],
            'email' => $u['email'],
            'role' => $u['role']
        ];

        $_SESSION['csrf'] = bin2hex(random_bytes(32));

        json_out(['ok' => true, 'csrf' => $_SESSION['csrf']]);
    }

    if ($action === 'me') {
        json_out([
            'user' => require_auth(),
            'csrf' => csrf_token()
        ]);
    }

    if ($action === 'logout') {
        require_auth();
        post_data();

        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires' => time() - 42000,
                'path' => $p['path'],
                'secure' => $p['secure'],
                'httponly' => $p['httponly'],
                'samesite' => 'Strict'
            ]);
        }
        session_destroy();
        json_out(['ok' => true]);
    }

    $user = require_auth();

    if ($method === 'POST' && $action !== 'login') {
        require_csrf();
    }

    /* Dashboard */
    if ($action === 'dashboard') {
        json_out([
            'students' => (int)row("SELECT COUNT(*) n FROM students")['n'],
            'courses' => (int)row("SELECT COUNT(*) n FROM courses")['n'],
            'batches' => (int)row("SELECT COUNT(*) n FROM batches")['n'],
            'collected' => (float)row(
                "SELECT COALESCE(SUM(amount),0) n FROM payments"
            )['n'],
            'recent' => rows(
                "SELECT roll_no,full_name,email,joined_on,status
                 FROM students ORDER BY id DESC LIMIT 8"
            )
        ]);
    }

    /* Students */
    if ($action === 'students' && $method === 'GET') {
        json_out(['data' => rows("SELECT * FROM students ORDER BY id DESC")]);
    }

    if ($action === 'save-student') {
        require_role(['admin', 'trainer']);
        $b = input_data();

        $roll = clean_string($b['roll_no'] ?? '', 40);
        $name = clean_string($b['full_name'] ?? '', 150);
        $email = clean_string($b['email'] ?? '', 190);
        $phone = clean_string($b['phone'] ?? '', 30);
        $address = clean_string($b['address'] ?? '', 500);
        $date = clean_string($b['joined_on'] ?? '', 10);
        $status = $b['status'] ?? 'active';

        if ($roll === '' || $name === '' || !valid_date($date) ||
            !in_array($status, ['active','inactive','completed'], true)) {
            json_out(['error' => 'Enter valid student details'], 422);
        }

        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            json_out(['error' => 'Invalid email address'], 422);
        }

        $id = id_value($b['id'] ?? 0);

        if ($id) {
            db()->prepare(
                "UPDATE students SET roll_no=?,full_name=?,email=?,
                 phone=?,address=?,joined_on=?,status=? WHERE id=?"
            )->execute([
                $roll, $name, $email ?: null, $phone ?: null,
                $address ?: null, $date, $status, $id
            ]);
        } else {
            db()->prepare(
                "INSERT INTO students
                 (roll_no,full_name,email,phone,address,joined_on,status)
                 VALUES (?,?,?,?,?,?,?)"
            )->execute([
                $roll, $name, $email ?: null, $phone ?: null,
                $address ?: null, $date, $status
            ]);
        }

        json_out(['ok' => true]);
    }

    if ($action === 'delete-student') {
        require_role(['admin']);
        $id = id_value(input_data()['id'] ?? 0);
        if (!$id) json_out(['error' => 'Invalid student ID'], 422);
        db()->prepare("DELETE FROM students WHERE id=?")->execute([$id]);
        json_out(['ok' => true]);
    }

    /* Courses */
    if ($action === 'courses' && $method === 'GET') {
        json_out(['data' => rows("SELECT * FROM courses ORDER BY course_name")]);
    }

    if ($action === 'save-course') {
        require_role(['admin']);
        $b = input_data();
        $name = clean_string($b['course_name'] ?? '', 150);
        $duration = id_value($b['duration_weeks'] ?? 0);
        $fee = $b['fee'] ?? null;
        $description = clean_string($b['description'] ?? '', 1000);

        if ($name === '' || !$duration || !is_numeric($fee) || $fee < 0) {
            json_out(['error' => 'Enter valid course details'], 422);
        }

        $id = id_value($b['id'] ?? 0);
        if ($id) {
            db()->prepare(
                "UPDATE courses SET course_name=?,duration_weeks=?,
                 fee=?,description=? WHERE id=?"
            )->execute([$name, $duration, $fee, $description ?: null, $id]);
        } else {
            db()->prepare(
                "INSERT INTO courses(course_name,duration_weeks,fee,description)
                 VALUES(?,?,?,?)"
            )->execute([$name, $duration, $fee, $description ?: null]);
        }
        json_out(['ok' => true]);
    }

    if ($action === 'delete-course') {
        require_role(['admin']);
        $id = id_value(input_data()['id'] ?? 0);
        try {
            db()->prepare("DELETE FROM courses WHERE id=?")->execute([$id]);
        } catch (PDOException $e) {
            json_out(['error' => 'Course is assigned to a batch'], 409);
        }
        json_out(['ok' => true]);
    }

    /* Batches */
    if ($action === 'batches' && $method === 'GET') {
        json_out(['data' => rows(
            "SELECT b.*,c.course_name FROM batches b
             JOIN courses c ON c.id=b.course_id ORDER BY b.id DESC"
        )]);
    }

    if ($action === 'save-batch') {
        require_role(['admin','trainer']);
        $b = input_data();

        $course = id_value($b['course_id'] ?? 0);
        $name = clean_string($b['batch_name'] ?? '', 120);
        $trainer = clean_string($b['trainer_name'] ?? '', 120);
        $start = clean_string($b['start_date'] ?? '', 10);
        $end = clean_string($b['end_date'] ?? '', 10);
        $schedule = clean_string($b['schedule'] ?? '', 150);

        if (!$course || $name === '' || !valid_date($start) ||
            ($end !== '' && !valid_date($end))) {
            json_out(['error' => 'Enter valid batch details'], 422);
        }

        db()->prepare(
            "INSERT INTO batches
             (course_id,batch_name,trainer_name,start_date,end_date,schedule)
             VALUES(?,?,?,?,?,?)"
        )->execute([
            $course, $name, $trainer ?: null, $start,
            $end ?: null, $schedule ?: null
        ]);

        json_out(['ok' => true]);
    }

    if ($action === 'delete-batch') {
        require_role(['admin']);
        $id = id_value(input_data()['id'] ?? 0);
        try {
            db()->prepare("DELETE FROM batches WHERE id=?")->execute([$id]);
        } catch (PDOException $e) {
            json_out(['error' => 'Batch has enrollments and cannot be deleted'], 409);
        }
        json_out(['ok' => true]);
    }

    /* Student enrollments */
    if ($action === 'enrollments' && $method === 'GET') {
        json_out(['data' => rows(
            "SELECT e.id,e.student_id,e.batch_id,e.agreed_fee,
                    s.full_name,s.roll_no,b.batch_name,c.course_name
             FROM enrollments e
             JOIN students s ON s.id=e.student_id
             JOIN batches b ON b.id=e.batch_id
             JOIN courses c ON c.id=b.course_id
             ORDER BY s.full_name"
        )]);
    }

    if ($action === 'save-enrollment') {
        require_role(['admin','trainer']);
        $b = input_data();
        $sid = id_value($b['student_id'] ?? 0);
        $bid = id_value($b['batch_id'] ?? 0);
        $date = clean_string($b['enrolled_on'] ?? '', 10);
        $fee = $b['agreed_fee'] ?? null;

        if (!$sid || !$bid || !valid_date($date) ||
            !is_numeric($fee) || $fee < 0) {
            json_out(['error' => 'Enter valid enrollment details'], 422);
        }

        db()->prepare(
            "INSERT INTO enrollments(student_id,batch_id,enrolled_on,agreed_fee)
             VALUES(?,?,?,?)"
        )->execute([$sid, $bid, $date, $fee]);

        json_out(['ok' => true]);
    }

    /* Attendance */
    if ($action === 'attendance' && $method === 'GET') {
        json_out(['data' => rows(
            "SELECT a.*,s.full_name,b.batch_name
             FROM attendance a
             JOIN enrollments e ON e.id=a.enrollment_id
             JOIN students s ON s.id=e.student_id
             JOIN batches b ON b.id=e.batch_id
             ORDER BY a.attendance_date DESC,a.id DESC LIMIT 300"
        )]);
    }

    if ($action === 'save-attendance') {
        require_role(['admin','trainer']);
        $b = input_data();
        $eid = id_value($b['enrollment_id'] ?? 0);
        $date = clean_string($b['attendance_date'] ?? '', 10);
        $status = $b['status'] ?? '';
        $notes = clean_string($b['notes'] ?? '', 255);

        if (!$eid || !valid_date($date) ||
            !in_array($status, ['present','absent','late','excused'], true)) {
            json_out(['error' => 'Enter valid attendance details'], 422);
        }

        db()->prepare(
            "INSERT INTO attendance(enrollment_id,attendance_date,status,notes)
             VALUES(?,?,?,?)
             ON DUPLICATE KEY UPDATE status=VALUES(status),notes=VALUES(notes)"
        )->execute([$eid, $date, $status, $notes ?: null]);

        json_out(['ok' => true]);
    }

    /* Fees */
    if ($action === 'fees' && $method === 'GET') {
        json_out(['data' => rows(
            "SELECT s.full_name,b.batch_name,e.agreed_fee,
                    COALESCE(p.paid,0) paid,
                    e.agreed_fee-COALESCE(p.paid,0) balance,
                    p.payment_date,p.method,p.reference_no
             FROM enrollments e
             JOIN students s ON s.id=e.student_id
             JOIN batches b ON b.id=e.batch_id
             LEFT JOIN (
                 SELECT enrollment_id,SUM(amount) paid,
                        MAX(payment_date) payment_date,
                        MAX(method) method,MAX(reference_no) reference_no
                 FROM payments GROUP BY enrollment_id
             ) p ON p.enrollment_id=e.id
             ORDER BY s.full_name"
        )]);
    }

    if ($action === 'save-payment') {
        require_role(['admin','accountant']);
        $b = input_data();
        $eid = id_value($b['enrollment_id'] ?? 0);
        $amount = $b['amount'] ?? null;
        $date = clean_string($b['payment_date'] ?? '', 10);
        $method = $b['method'] ?? 'upi';
        $ref = clean_string($b['reference_no'] ?? '', 100);
        $notes = clean_string($b['notes'] ?? '', 255);

        if (!$eid || !is_numeric($amount) || $amount <= 0 ||
            !valid_date($date) ||
            !in_array($method, ['cash','upi','bank_transfer','card','other'], true)) {
            json_out(['error' => 'Enter valid payment details'], 422);
        }

        db()->prepare(
            "INSERT INTO payments
             (enrollment_id,amount,payment_date,method,reference_no,notes,created_by)
             VALUES(?,?,?,?,?,?,?)"
        )->execute([
            $eid, $amount, $date, $method, $ref ?: null,
            $notes ?: null, $user['id']
        ]);

        json_out(['ok' => true]);
    }

    /* Assessment results */
    if ($action === 'results' && $method === 'GET') {
        json_out(['data' => rows(
            "SELECT r.*,s.full_name,b.batch_name
             FROM results r
             JOIN enrollments e ON e.id=r.enrollment_id
             JOIN students s ON s.id=e.student_id
             JOIN batches b ON b.id=e.batch_id
             ORDER BY r.assessment_date DESC,r.id DESC"
        )]);
    }

    if ($action === 'save-result') {
        require_role(['admin','trainer']);
        $b = input_data();
        $eid = id_value($b['enrollment_id'] ?? 0);
        $name = clean_string($b['assessment_name'] ?? '', 150);
        $marks = $b['marks_obtained'] ?? null;
        $total = $b['total_marks'] ?? null;
        $date = clean_string($b['assessment_date'] ?? '', 10);
        $remarks = clean_string($b['remarks'] ?? '', 255);

        if (!$eid || $name === '' || !is_numeric($marks) ||
            !is_numeric($total) || $total <= 0 ||
            $marks < 0 || $marks > $total || !valid_date($date)) {
            json_out(['error' => 'Enter valid assessment details'], 422);
        }

        db()->prepare(
            "INSERT INTO results
             (enrollment_id,assessment_name,marks_obtained,total_marks,assessment_date,remarks)
             VALUES(?,?,?,?,?,?)"
        )->execute([
            $eid, $name, $marks, $total, $date, $remarks ?: null
        ]);

        json_out(['ok' => true]);
    }

    /* Summary reports */
    if ($action === 'report') {
        require_role(['admin','accountant']);

        $students = (int)row("SELECT COUNT(*) n FROM students")['n'];
        $agreed = (float)row("SELECT COALESCE(SUM(agreed_fee),0) n FROM enrollments")['n'];
        $collected = (float)row("SELECT COALESCE(SUM(amount),0) n FROM payments")['n'];

        json_out(['data' => [
            'students' => $students,
            'agreed' => $agreed,
            'collected' => $collected,
            'balance' => $agreed - $collected
        ]]);
    }

    /* CSV exports */
    if (str_starts_with($action, 'export-')) {
        require_role(['admin','accountant']);

        $exports = [
            'export-students' => [
                "SELECT roll_no,full_name,email,phone,joined_on,status
                 FROM students ORDER BY full_name",
                'students.csv'
            ],
            'export-fees' => [
                "SELECT s.roll_no,s.full_name,b.batch_name,e.agreed_fee,
                        COALESCE(p.paid,0) paid,
                        e.agreed_fee-COALESCE(p.paid,0) balance
                 FROM enrollments e
                 JOIN students s ON s.id=e.student_id
                 JOIN batches b ON b.id=e.batch_id
                 LEFT JOIN (
                    SELECT enrollment_id,SUM(amount) paid
                    FROM payments GROUP BY enrollment_id
                 ) p ON p.enrollment_id=e.id",
                'fees.csv'
            ],
            'export-results' => [
                "SELECT s.roll_no,s.full_name,b.batch_name,r.assessment_name,
                        r.marks_obtained,r.total_marks,r.assessment_date,r.remarks
                 FROM results r
                 JOIN enrollments e ON e.id=r.enrollment_id
                 JOIN students s ON s.id=e.student_id
                 JOIN batches b ON b.id=e.batch_id",
                'results.csv'
            ]
        ];

        if (!isset($exports[$action])) {
            json_out(['error' => 'Unknown export'], 404);
        }

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="' .
            $exports[$action][1] . '"');

        $out = fopen('php://output', 'w');
        $data = rows($exports[$action][0]);

        if ($data) {
            fputcsv($out, array_keys($data[0]));
            foreach ($data as $record) {
                fputcsv($out, array_values($record));
            }
        }

        fclose($out);
        exit;
    }

    json_out(['error' => 'Unknown action'], 404);

} catch (PDOException $e) {
    error_log('Student portal database error: ' . $e->getMessage());

    if ($e->getCode() === '23000') {
        json_out(['error' => 'Duplicate value or related records prevent this operation'], 409);
    }

    json_out(['error' => 'Database operation failed. Check server logs.'], 500);

} catch (Throwable $e) {
    error_log('Student portal error: ' . $e->getMessage());
    json_out(['error' => 'Unexpected server error. Check server logs.'], 500);
}
