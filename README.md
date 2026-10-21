
# Student Management System — LEMP Stack

A PHP and MySQL student administration application for Amazon Linux 2023.

## Features
- Secure staff login and role-based access
- Student registration, search, edit and delete
- Course and batch management
- Student enrollment
- Attendance tracking
- Fee payment tracking and balance calculation
- Assessment results
- Dashboard and CSV reports

## Technology
- Linux: Amazon Linux 2023
- Web server: Nginx
- Backend: PHP-FPM and PDO
- Database: MariaDB / MySQL
- Frontend: HTML, CSS and JavaScript

## Installation
1. Install Nginx, PHP-FPM, PHP MySQL extensions and MariaDB.
2. Create the `student_portal` database and `student_app` user.
3. Import `sql/schema.sql`.
4. Update credentials and application secret in `app/config.php`.
5. Create an administrator using `app/create_admin.php`.
6. Configure Nginx using `deploy/nginx-student-management.conf`.
7. Restart PHP-FPM and reload Nginx.
8. Open `/login.html` using your EC2 public IP.

## Security
- Never use the database root account from PHP.
- Restrict SSH access to your IP.
- Never expose port 3306 publicly.
- Configure HTTPS before entering real student information.
- Keep application secrets out of Git.
- Use test records until the application has been security-reviewed.
