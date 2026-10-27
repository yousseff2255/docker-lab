import React, { useState, useEffect } from 'react';

export default function App() {
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [enrolledStudents, setEnrolledStudents] = useState([]);

  // Forms state
  const [newCourse, setNewCourse] = useState({ code: '', title: '', seats: '' });
  const [newStudent, setNewStudent] = useState({ name: '', email: '' });
  const [regData, setRegData] = useState({ student_id: '', course_id: '' });

  // Error/Success message state
  const [message, setMessage] = useState({ text: '', isError: false });

  const showMsg = (text, isError = false) => {
    setMessage({ text, isError });
    setTimeout(() => setMessage({ text: '', isError: false }), 5000);
  };

  // Fetch functions
  const loadCourses = async () => {
    try {
      const res = await fetch('/api/courses');
      const data = await res.json();
      setCourses(data);
    } catch (err) {
      showMsg('Failed to load courses', true);
    }
  };

  const loadStudents = async () => {
    try {
      const res = await fetch('/api/students');
      const data = await res.json();
      setStudents(data);
    } catch (err) {
      showMsg('Failed to load students', true);
    }
  };

  const loadEnrolledStudents = async (courseId) => {
    if (!courseId) return;
    try {
      const res = await fetch(`/api/courses/${courseId}/students`);
      const data = await res.json();
      setEnrolledStudents(data);
    } catch (err) {
      showMsg('Failed to load roster', true);
    }
  };

  useEffect(() => {
    loadCourses();
    loadStudents();
  }, []);

  useEffect(() => {
    if (selectedCourseId) {
      loadEnrolledStudents(selectedCourseId);
    } else {
      setEnrolledStudents([]);
    }
  }, [selectedCourseId]);

  // Event Handlers
  const handleAddCourse = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newCourse, seats: parseInt(newCourse.seats) }),
    });
    const data = await res.json();
    if (!res.ok) return showMsg(data.detail || 'Error adding course', true);
    
    setNewCourse({ code: '', title: '', seats: '' });
    showMsg('Course added successfully!');
    loadCourses();
  };

  const handleDeleteCourse = async (id) => {
    const res = await fetch(`/api/courses/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      return showMsg(data.detail || 'Error deleting course', true);
    }
    showMsg('Course deleted!');
    if (selectedCourseId === String(id)) setSelectedCourseId('');
    loadCourses();
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newStudent),
    });
    const data = await res.json();
    if (!res.ok) return showMsg(data.detail || 'Error adding student', true);

    setNewStudent({ name: '', email: '' });
    showMsg('Student registered successfully!');
    loadStudents();
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: parseInt(regData.student_id),
        course_id: parseInt(regData.course_id),
      }),
    });
    const data = await res.json();
    if (!res.ok) return showMsg(data.detail || 'Registration failed', true);

    showMsg('Student enrolled in course!');
    loadCourses();
    if (selectedCourseId === regData.course_id) {
      loadEnrolledStudents(regData.course_id);
    }
  };

  const handleCancelRegistration = async (regId) => {
    const res = await fetch(`/api/registrations/${regId}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      return showMsg(data.detail || 'Error canceling registration', true);
    }
    showMsg('Registration canceled!');
    loadCourses();
    loadEnrolledStudents(selectedCourseId);
  };

  return (
    <div style={{ maxWidth: '900px', margin: '20px auto', fontFamily: 'system-ui, sans-serif', padding: '0 15px' }}>
      <h1>University Registration System</h1>

      {message.text && (
        <div style={{
          padding: '10px 15px',
          borderRadius: '5px',
          marginBottom: '20px',
          backgroundColor: message.isError ? '#f8d7da' : '#d4edda',
          color: message.isError ? '#721c24' : '#155724',
        }}>
          {message.text}
        </div>
      )}

      {/* Courses & Students Management */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        
        {/* Course Form & List */}
        <section style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '15px' }}>
          <h2>Courses</h2>
          <form onSubmit={handleAddCourse} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
            <input placeholder="Course Code (e.g. CS101)" value={newCourse.code} onChange={e => setNewCourse({...newCourse, code: e.target.value})} required />
            <input placeholder="Title" value={newCourse.title} onChange={e => setNewCourse({...newCourse, title: e.target.value})} required />
            <input type="number" placeholder="Total Seats" value={newCourse.seats} onChange={e => setNewCourse({...newCourse, seats: e.target.value})} required />
            <button type="submit">Add Course</button>
          </form>

          <ul style={{ listStyle: 'none', padding: 0 }}>
            {courses.map(c => (
              <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0', padding: '8px', background: '#f9f9f9', borderRadius: '4px' }}>
                <span><strong>{c.code}</strong>: {c.title} ({c.seats} seats)</span>
                <button onClick={() => handleDeleteCourse(c.id)} style={{ color: 'red' }}>Delete</button>
              </li>
            ))}
          </ul>
        </section>

        {/* Student Form & List */}
        <section style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '15px' }}>
          <h2>Students</h2>
          <form onSubmit={handleAddStudent} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
            <input placeholder="Full Name" value={newStudent.name} onChange={e => setNewStudent({...newStudent, name: e.target.value})} required />
            <input type="email" placeholder="Email Address" value={newStudent.email} onChange={e => setNewStudent({...newStudent, email: e.target.value})} required />
            <button type="submit">Add Student</button>
          </form>

          <ul style={{ listStyle: 'none', padding: 0 }}>
            {students.map(s => (
              <li key={s.id} style={{ margin: '8px 0', padding: '8px', background: '#f9f9f9', borderRadius: '4px' }}>
                <strong>{s.name}</strong> ({s.email})
              </li>
            ))}
          </ul>
        </section>

      </div>

      {/* Registration & Roster Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
        
        {/* Register Form */}
        <section style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '15px' }}>
          <h2>Enroll Student</h2>
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <select value={regData.student_id} onChange={e => setRegData({...regData, student_id: e.target.value})} required>
              <option value="">Select Student</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.email})</option>)}
            </select>

            <select value={regData.course_id} onChange={e => setRegData({...regData, course_id: e.target.value})} required>
              <option value="">Select Course</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.code} - {c.title}</option>)}
            </select>

            <button type="submit">Register Student</button>
          </form>
        </section>

        {/* Class Roster */}
        <section style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '15px' }}>
          <h2>Course Class Roster</h2>
          <select value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)} style={{ width: '100%', padding: '8px', marginBottom: '10px' }}>
            <option value="">Select Course to View Enrolled Students</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.code} - {c.title}</option>)}
          </select>

          <ul style={{ listStyle: 'none', padding: 0 }}>
            {enrolledStudents.map(s => (
              <li key={s.registration_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0', padding: '8px', background: '#f9f9f9', borderRadius: '4px' }}>
                <span>{s.name} ({s.email})</span>
                <button onClick={() => handleCancelRegistration(s.registration_id)} style={{ color: 'orange' }}>Cancel</button>
              </li>
            ))}
            {selectedCourseId && enrolledStudents.length === 0 && (
              <p style={{ color: '#666' }}>No students currently enrolled in this course.</p>
            )}
          </ul>
        </section>

      </div>
    </div>
  );
}