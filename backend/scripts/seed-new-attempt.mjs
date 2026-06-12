// One-shot script: create a fresh submitted attempt for test@test.com
// Run: node scripts/seed-new-attempt.mjs

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabase = createClient(
  'https://aqimqiyqtagwnjgrivpq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxaW1xaXlxdGFnd25qZ3JpdnBxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODAxMDgzNywiZXhwIjoyMDkzNTg2ODM3fQ.kufhI9Z5cxcRY55hLUMrSuEnBQPgC7_10z63Gq5hbrA',
);

// 1. Find test@test.com user
const { data: authUsers } = await supabase.auth.admin.listUsers();
const student = authUsers?.users?.find(u => u.email === 'test@test.com');
if (!student) { console.error('test@test.com not found'); process.exit(1); }
console.log('Student ID:', student.id);

// 2. Find the student's profile to get teacher assignment
const { data: profile } = await supabase
  .from('users')
  .select('id, display_name, role')
  .eq('id', student.id)
  .single();
console.log('Profile:', profile);

// 3. Find an active assignment for this student
const { data: assignments } = await supabase
  .from('assignments')
  .select('id, teacher_id, quran_page_id, title, status')
  .eq('student_id', student.id)
  .eq('status', 'active')
  .limit(5);
console.log('Assignments:', assignments);

if (!assignments?.length) { console.error('No active assignments found'); process.exit(1); }

// Pick the first active assignment
const assignment = assignments[0];
console.log('Using assignment:', assignment.id, assignment.title);

// 4. Check for existing submission on this assignment
const { data: existingSubs } = await supabase
  .from('submissions')
  .select('id, status, current_attempt_id')
  .eq('assignment_id', assignment.id)
  .eq('student_id', student.id)
  .is('deleted_at', null)
  .limit(1);

let submissionId;

if (existingSubs?.length) {
  // Reuse existing submission, update status to submitted
  submissionId = existingSubs[0].id;
  console.log('Reusing submission:', submissionId, 'status:', existingSubs[0].status);
} else {
  // Create a new submission
  const { data: newSub, error: subErr } = await supabase
    .from('submissions')
    .insert({
      id: randomUUID(),
      assignment_id: assignment.id,
      student_id: student.id,
      quran_page_id: assignment.quran_page_id,
      status: 'submitted',
      current_attempt_id: null,
      submitted_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (subErr) { console.error('Create submission failed:', subErr); process.exit(1); }
  submissionId = newSub.id;
  console.log('Created submission:', submissionId);
}

// 5. Count existing attempts to determine next attempt number
const { data: existingAttempts } = await supabase
  .from('submission_attempts')
  .select('attempt_number')
  .eq('submission_id', submissionId)
  .is('deleted_at', null)
  .order('attempt_number', { ascending: false })
  .limit(1);

const nextAttemptNumber = existingAttempts?.length ? existingAttempts[0].attempt_number + 1 : 1;
console.log('Next attempt number:', nextAttemptNumber);

// 6. Create the attempt
const attemptId = randomUUID();
const storageKey = `student-recordings/${student.id}/${submissionId}/attempts/attempt-${nextAttemptNumber}.m4a`;

const { data: attempt, error: attErr } = await supabase
  .from('submission_attempts')
  .insert({
    id: attemptId,
    submission_id: submissionId,
    student_id: student.id,
    quran_page_id: assignment.quran_page_id,
    attempt_number: nextAttemptNumber,
    recording_storage_key: storageKey,
    recording_duration_ms: 47000,
    original_file_name: `attempt-${nextAttemptNumber}.m4a`,
    content_type: 'audio/m4a',
    size_bytes: 940000,
    status: 'submitted',
    submitted_at: new Date().toISOString(),
  })
  .select()
  .single();

if (attErr) { console.error('Create attempt failed:', attErr); process.exit(1); }
console.log('Created attempt:', attempt.id, 'attempt #', attempt.attempt_number);

// 7. Update submission to point to new attempt and mark submitted
const { error: updateErr } = await supabase
  .from('submissions')
  .update({
    current_attempt_id: attemptId,
    status: 'submitted',
    submitted_at: new Date().toISOString(),
  })
  .eq('id', submissionId);

if (updateErr) { console.error('Update submission failed:', updateErr); process.exit(1); }

console.log('\n✅ Done!');
console.log('  Submission ID:', submissionId);
console.log('  Attempt ID:   ', attemptId);
console.log('  Attempt #:    ', nextAttemptNumber);
console.log('  Assignment:   ', assignment.title ?? assignment.id);
