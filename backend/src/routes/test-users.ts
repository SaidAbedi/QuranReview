import { Router } from 'express';
import { supabaseAdmin } from '../db/client';

const router = Router();

// Reset test@test.com and teacher@gmail.com with known passwords
// **DEVELOPMENT ONLY** — remove in production
router.post('/test-users/reset-passwords', async (req, res, next) => {
  try {
    // Get users by email
    const { data: testUser } = await supabaseAdmin.auth.admin.listUsers();

    const student = testUser?.users.find((u) => u.email === 'test@test.com');
    const teacher = testUser?.users.find((u) => u.email === 'teacher@gmail.com');

    if (student) {
      await supabaseAdmin.auth.admin.updateUserById(student.id, {
        password: 'password123',
        email_confirm: true,
      });
    }

    if (teacher) {
      await supabaseAdmin.auth.admin.updateUserById(teacher.id, {
        password: 'password1234',
        email_confirm: true,
      });
    }

    res.json({
      message: 'Test passwords reset',
      users: {
        'test@test.com': student ? 'password123' : 'not found',
        'teacher@gmail.com': teacher ? 'password1234' : 'not found',
      },
    });
  } catch (error) {
    next(error);
  }
});

// Clear all attempts, submissions, and progress for test users
// **DEVELOPMENT ONLY** — remove in production
router.post('/test-users/clear-data', async (req, res, next) => {
  try {
    // Get test student user
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const testStudent = users?.users.find((u) => u.email === 'test@test.com');

    if (!testStudent) {
      return res.json({ message: 'Test student not found' });
    }

    // Get all submissions for this student first
    const { data: submissions } = await supabaseAdmin
      .from('submissions')
      .select('id')
      .eq('student_id', testStudent.id);

    const submissionIds = submissions?.map((s) => s.id) ?? [];

    // Delete voice notes for annotations
    if (submissionIds.length > 0) {
      await supabaseAdmin
        .from('annotation_voice_notes')
        .delete()
        .in('annotation_id',
          (await supabaseAdmin
            .from('annotations')
            .select('id')
            .in('submission_id', submissionIds))
            .data?.map((a) => a.id) ?? []
        );
    }

    // Delete all annotations for submissions
    if (submissionIds.length > 0) {
      await supabaseAdmin
        .from('annotations')
        .delete()
        .in('submission_id', submissionIds);
    }

    // Delete all submission attempts for this student
    await supabaseAdmin
      .from('submission_attempts')
      .delete()
      .eq('student_id', testStudent.id);

    // Delete all submissions for this student
    await supabaseAdmin
      .from('submissions')
      .delete()
      .eq('student_id', testStudent.id);

    // Reset student page progress
    await supabaseAdmin
      .from('student_page_progress')
      .delete()
      .eq('student_id', testStudent.id);

    res.json({
      message: 'Test data cleared for test@test.com',
      deletedSubmissions: submissionIds.length,
    });
  } catch (error) {
    next(error);
  }
});

// Setup roles for test users
// **DEVELOPMENT ONLY** — remove in production
router.post('/test-users/setup-roles', async (req, res, next) => {
  try {
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const testStudent = users?.users.find((u) => u.email === 'test@test.com');
    const testTeacher = users?.users.find((u) => u.email === 'teacher@gmail.com');

    if (testStudent) {
      await supabaseAdmin
        .from('users')
        .update({ role: 'student' })
        .eq('id', testStudent.id);
    }

    if (testTeacher) {
      await supabaseAdmin
        .from('users')
        .update({ role: 'teacher' })
        .eq('id', testTeacher.id);
    }

    res.json({
      message: 'Roles set up',
      student: testStudent ? 'student' : 'not found',
      teacher: testTeacher ? 'teacher' : 'not found',
    });
  } catch (error) {
    next(error);
  }
});

export { router as testUsersRouter };
