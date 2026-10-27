import os
import time
import json
from contextlib import asynccontextmanager
import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import FastAPI, HTTPException, status, Response
from pydantic import BaseModel, EmailStr, Field
import redis 

# Database Connection Settings
DB_HOST = os.environ.get("DB_HOST", "database")
DB_NAME = os.environ.get("POSTGRES_DB", "university_db")
DB_USER = os.environ.get("POSTGRES_USER", "postgres")
DB_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "supersecretpassword")


def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        cursor_factory=RealDictCursor
    )


def wait_for_db():
    """Retry connecting to PostgreSQL until it is ready."""
    for attempt in range(30):
        try:
            conn = get_db_connection()
            conn.close()
            print("PostgreSQL connection established successfully.", flush=True)
            return
        except psycopg2.OperationalError:
            print(f"Database waiting ({attempt + 1}/30)...", flush=True)
            time.sleep(2)
    raise RuntimeError("Could not connect to PostgreSQL database.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    wait_for_db()
    yield


app = FastAPI(
    title="University Registration API",
    version="1.0.0",
    lifespan=lifespan
)

# Connect to Redis container
redis_client = redis.Redis(
    host=os.getenv("REDIS_HOST", "redis"),
    port=6379,
    db=0,
    decode_responses=True
)


# --- PYDANTIC SCHEMAS ---
class CourseCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50, example="CS101")
    title: str = Field(..., min_length=1, max_length=255, example="Intro to CS")
    seats: int = Field(..., ge=0, example=30)


class StudentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, example="Alice Smith")
    email: EmailStr = Field(..., example="alice@university.edu")


class RegistrationCreate(BaseModel):
    student_id: int
    course_id: int


# --- COURSES ENDPOINTS ---
@app.get("/api/courses")
def get_courses():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM courses ORDER BY id;")
    courses = cur.fetchall()
    cur.close()
    conn.close()
    return courses


@app.post("/api/courses", status_code=status.HTTP_201_CREATED)
def add_course(course: CourseCreate):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO courses (code, title, seats) VALUES (%s, %s, %s) RETURNING *;",
            (course.code.strip(), course.title.strip(), course.seats)
        )
        new_course = cur.fetchone()
        conn.commit()
        return new_course
    except psycopg2.IntegrityError:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Course code '{course.code}' already exists."
        )
    finally:
        cur.close()
        conn.close()


@app.delete("/api/courses/{course_id}")
def delete_course(course_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM courses WHERE id = %s RETURNING id;", (course_id,))
    deleted = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found."
        )
    return {"message": "Course deleted successfully."}


# --- STUDENTS ENDPOINTS (WITH REDIS CACHING) ---
@app.get("/api/students")
def get_students(response: Response):
    cache_key = "students_list"

    # 1. Try to fetch cached data from Redis
    try:
        cached_students = redis_client.get(cache_key)
        if cached_students:
            response.headers["X-Cache-Status"] = "HIT"
            return json.loads(cached_students)
    except Exception as e:
        print(f"Redis Cache Error: {e}")

    # 2. Cache Miss: Fetch from PostgreSQL database
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM students ORDER BY id;")
    students = cur.fetchall()
    cur.close()
    conn.close()

    # 3. Store result in Redis for 60 seconds
    try:
        redis_client.setex(cache_key, 60, json.dumps(students, default=str))
    except Exception as e:
        print(f"Redis Save Error: {e}")

    response.headers["X-Cache-Status"] = "MISS"
    return students


@app.post("/api/students", status_code=status.HTTP_201_CREATED)
def add_student(student: StudentCreate):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO students (name, email) VALUES (%s, %s) RETURNING *;",
            (student.name.strip(), student.email)
        )
        new_student = cur.fetchone()
        conn.commit()

        # Invalidate cache so fresh data is loaded on next GET request
        try:
            redis_client.delete("students_list")
        except Exception as e:
            print(f"Redis Delete Error: {e}")

        return new_student
    except psycopg2.IntegrityError:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Student email '{student.email}' is already registered."
        )
    finally:
        cur.close()
        conn.close()


# --- REGISTRATION & BUSINESS RULES ---
@app.post("/api/registrations", status_code=status.HTTP_201_CREATED)
def register_student(reg: RegistrationCreate):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT seats FROM courses WHERE id = %s;", (reg.course_id,))
        course = cur.fetchone()
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found."
            )

        max_seats = course["seats"]

        cur.execute(
            "SELECT COUNT(*) as count FROM registrations WHERE course_id = %s;",
            (reg.course_id,)
        )
        enrolled_count = cur.fetchone()["count"]

        if enrolled_count >= max_seats:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Course has reached maximum seat capacity."
            )

        cur.execute(
            "INSERT INTO registrations (student_id, course_id) VALUES (%s, %s) RETURNING *;",
            (reg.student_id, reg.course_id)
        )
        new_reg = cur.fetchone()
        conn.commit()
        return new_reg

    except psycopg2.IntegrityError:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student is already registered in this course."
        )
    finally:
        cur.close()
        conn.close()


@app.delete("/api/registrations/{reg_id}")
def cancel_registration(reg_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM registrations WHERE id = %s RETURNING id;", (reg_id,))
    deleted = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration record not found."
        )
    return {"message": "Registration canceled successfully."}


@app.get("/api/courses/{course_id}/students")
def get_course_students(course_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    query = """
        SELECT s.id, s.name, s.email, r.id as registration_id, r.registered_at
        FROM students s
        JOIN registrations r ON s.id = r.student_id
        WHERE r.course_id = %s
        ORDER BY r.registered_at;
    """
    cur.execute(query, (course_id,))
    enrolled_students = cur.fetchall()
    cur.close()
    conn.close()
    return enrolled_students