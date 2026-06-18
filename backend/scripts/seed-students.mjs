// Seed 3 new students assigned to teacher@test.com with submitted attempts.
// Run: node scripts/seed-students.mjs

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const sb = createClient(
  'https://aqimqiyqtagwnjgrivpq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxaW1xaXlxdGFnd25qZ3JpdnBxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODAxMDgzNywiZXhwIjoyMDkzNTg2ODM3fQ.kufhI9Z5cxcRY55hLUMrSuEnBQPgC7_10z63Gq5hbrA',
);

const TEACHER_ID = '976c56fb-b152-42c9-9554-a50e9bdda856'; // teacher@test.com

// Quran page IDs already in the DB
const PAGE_1 = 'bd790763-02f6-4f00-b9bb-07b0701438c8'; // Page 1 — Al-Fatiha
const PAGE_2 = 'f2fbc810-69e4-44f2-81e4-4d2334d8defb'; // Page 2 — Al-Baqarah
const PAGE_3 = 'aea8bb1b-f7f7-4e27-95d6-4cb638c4359d'; // Page 3 — Al-Baqarah

const STUDENTS = [
  {
    email:       'ali@test.com',
    password:    'test1234',
    displayName: 'Ali Hassan',
    assignments: [
      { pageId: PAGE_1, title: 'Al-Fatiha — Page 1', submissionStatus: 'submitted' },
      { pageId: PAGE_2, title: 'Al-Baqarah — Page 2', submissionStatus: 'submitted' },
    ],
  },
  {
    email:       'sara@test.com',
    password:    'test1234',
    displayName: 'Sara Ahmed',
    assignments: [
      { pageId: PAGE_1, title: 'Al-Fatiha — Page 1', submissionStatus: 'submitted' },
      { pageId: PAGE_3, title: 'Al-Baqarah — Page 3', submissionStatus: 'submitted' },
    ],
  },
  {
    email:       'omar@test.com',
    password:    'test1234',
    displayName: 'Omar Khalid',
    assignments: [
      { pageId: PAGE_2, title: 'Al-Baqarah — Page 2', submissionStatus: 'submitted' },
    ],
  },
];

async function createOrFindUser(email, password, displayName) {
  // Check if already exists
  const { data: authList } = await sb.auth.admin.listUsers();
  const existing = authList?.users?.find(u => u.email === email);
  if (existing) {
    console.log(`  ↩ Auth user already exists: ${email} (${existing.id})`);
    return existing.id;
  }

  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  console.log(`  ✓ Created auth user: ${email} (${data.user.id})`);
  return data.user.id;
}

async function ensureProfile(userId, email, displayName) {
  const { data: existing } = await sb.from('users').select('id').eq('id', userId).single();
  if (existing) {
    console.log(`  ↩ Profile exists for ${email}`);
    return;
  }
  const { error } = await sb.from('users').insert({
    id: userId,
    email,
    display_name: displayName,
    role: 'student',
  });
  if (error) throw new Error(`insert profile ${email}: ${error.message}`);
  console.log(`  ✓ Created profile: ${displayName}`);
}

async function seedAssignment(studentId, teacherId, pageId, title, submissionStatus) {
  // Check for existing assignment on same page for this student/teacher
  const { data: existing } = await sb
    .from('assignments')
    .select('id')
    .eq('student_id', studentId)
    .eq('teacher_id', teacherId)
    .eq('quran_page_id', pageId)
    .eq('assignment_type', 'teacher_assigned')
    .is('deleted_at', null)
    .limit(1);

  let assignmentId;
  if (existing?.length) {
    assignmentId = existing[0].id;
    console.log(`  ↩ Assignment already exists: ${assignmentId} (${title})`);
  } else {
    assignmentId = randomUUID();
    const { error } = await sb.from('assignments').insert({
      id: assignmentId,
      teacher_id: teacherId,
      student_id: studentId,
      quran_page_id: pageId,
      title,
      status: 'submitted',
      assignment_type: 'teacher_assigned',
    });
    if (error) throw new Error(`insert assignment ${title}: ${error.message}`);
    console.log(`  ✓ Created assignment: ${title}`);
  }

  // Check for existing submission
  const { data: existingSub } = await sb
    .from('submissions')
    .select('id, current_attempt_id')
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId)
    .is('deleted_at', null)
    .limit(1);

  let submissionId;
  let attemptId;

  if (existingSub?.length) {
    submissionId = existingSub[0].id;
    attemptId = existingSub[0].current_attempt_id;
    console.log(`  ↩ Submission already exists: ${submissionId}`);
    return;
  }

  // Create attempt first (without submission FK to avoid null current_attempt_id constraint)
  submissionId = randomUUID();
  attemptId = randomUUID();
  const storageKey = `student-recordings/${studentId}/${assignmentId}/${submissionId}/attempts/attempt-001.m4a`;

  // Insert submission with null current_attempt_id
  const { error: subErr } = await sb.from('submissions').insert({
    id: submissionId,
    assignment_id: assignmentId,
    student_id: studentId,
    quran_page_id: pageId,
    status: submissionStatus,
    current_attempt_id: null,
    submitted_at: new Date().toISOString(),
  });
  if (subErr) throw new Error(`insert submission: ${subErr.message}`);

  // Insert attempt
  const { error: attErr } = await sb.from('submission_attempts').insert({
    id: attemptId,
    submission_id: submissionId,
    student_id: studentId,
    quran_page_id: pageId,
    attempt_number: 1,
    recording_storage_key: storageKey,
    recording_duration_ms: 42000 + Math.floor(Math.random() * 30000),
    original_file_name: 'attempt-001.m4a',
    content_type: 'audio/m4a',
    size_bytes: 880000,
    status: submissionStatus,
    submitted_at: new Date().toISOString(),
  });
  if (attErr) throw new Error(`insert attempt: ${attErr.message}`);

  // Update submission to point to attempt
  const { error: updErr } = await sb
    .from('submissions')
    .update({ current_attempt_id: attemptId })
    .eq('id', submissionId);
  if (updErr) throw new Error(`update submission current_attempt_id: ${updErr.message}`);

  // Sync assignment status — assignments only allow: assigned, submitted, reviewed, archived
  const asgnStatusMap = {
    draft: 'assigned', submitted: 'submitted', in_review: 'submitted',
    reviewed: 'reviewed', needs_resubmission: 'reviewed',
    completed: 'reviewed', archived: 'archived',
  };
  const aStatus = asgnStatusMap[submissionStatus] ?? 'submitted';
  await sb.from('assignments').update({ status: aStatus }).eq('id', assignmentId);

  console.log(`  ✓ Created submission + attempt (status: ${submissionStatus})`);
}

// ── Run ──────────────────────────────────────────────────────────────────────

for (const s of STUDENTS) {
  console.log(`\n── ${s.displayName} (${s.email}) ──`);
  const userId = await createOrFindUser(s.email, s.password, s.displayName);
  await ensureProfile(userId, s.email, s.displayName);

  for (const a of s.assignments) {
    await seedAssignment(userId, TEACHER_ID, a.pageId, a.title, a.submissionStatus);
  }
}

console.log('\n✅ Seed complete.\n');
console.log('Student login credentials:');
console.log('  ali@test.com   / test1234');
console.log('  sara@test.com  / test1234');
console.log('  omar@test.com  / test1234');
console.log('\nTeacher:');
console.log('  teacher@test.com / (existing password)');
