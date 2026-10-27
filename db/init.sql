CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    seats INT NOT NULL CHECK (seats >= 0)
);

CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS registrations (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_student_course UNIQUE (student_id, course_id)
);

-- Initial Sample Data
INSERT INTO courses (code, title, seats) VALUES 
('CS101', 'Introduction to Computer Science', 2),
('CS301', 'Cloud Architecture', 30)
ON CONFLICT (code) DO NOTHING;

INSERT INTO students (name, email) VALUES 
('Alice Smith', 'alice@university.edu'),
('Bob Jones', 'bob@university.edu')
ON CONFLICT (email) DO NOTHING;

INSERT INTO registrations (student_id, course_id) VALUES (1, 1)
ON CONFLICT (student_id, course_id) DO NOTHING;