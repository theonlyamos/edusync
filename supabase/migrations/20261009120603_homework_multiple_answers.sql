-- Add multiple-answer choices without rewriting published homework or submitted work.
CREATE OR REPLACE FUNCTION public.homework_mutate(p_actor uuid,p_homework uuid,p_action text,p_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  h public.homeworks; a public.homework_attempts; g public.homework_grades; r public.homework_recipients;
  k jsonb; q jsonb; v jsonb; scores jsonb; score numeric; ids uuid[]; target uuid; due timestamptz; closing timestamptz;
  actor_role text; selected_count integer; result jsonb; item jsonb; f public.homework_attachments;
BEGIN
  SELECT role INTO actor_role FROM public.users WHERE id=p_actor;
  IF actor_role IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_action='create' THEN
    IF actor_role NOT IN ('teacher','admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.lessons l JOIN public.teachers t ON t.id=l.teacher_id
      JOIN public.lesson_publications lp ON lp.lesson_id=l.id AND lp.id=(p_payload->>'publication_id')::uuid
      WHERE l.id=(p_payload->>'lesson_id')::uuid AND (t.user_id=p_actor OR actor_role='admin')) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    INSERT INTO public.homeworks(owner_id,organization_id,lesson_id,publication_id,publication_version,title,instructions,subject,grade_level,lesson_title,objectives,questions,due_at,close_at,timezone,accept_late,allow_hints,allow_references,minutes)
    VALUES(p_actor,(p_payload->>'organization_id')::uuid,(p_payload->>'lesson_id')::uuid,(p_payload->>'publication_id')::uuid,(p_payload->>'publication_version')::integer,
      p_payload->>'title',p_payload->>'instructions',p_payload->>'subject',p_payload->>'grade_level',p_payload->>'lesson_title',p_payload->'objectives',p_payload->'questions',
      (p_payload->>'due_at')::timestamptz,(p_payload->>'close_at')::timestamptz,p_payload->>'timezone',(p_payload->>'accept_late')::boolean,(p_payload->>'allow_hints')::boolean,(p_payload->>'allow_references')::boolean,(p_payload->>'minutes')::integer)
    RETURNING * INTO h;
    INSERT INTO public.homework_keys VALUES(h.id,p_payload->'keys');
    RETURN jsonb_build_object('id',h.id,'version',h.version);
  END IF;
  SELECT * INTO h FROM public.homeworks WHERE id=p_homework FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF actor_role IN ('teacher','admin') THEN
    IF h.owner_id<>p_actor THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    IF (h.status='published' OR h.published_at IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=h.organization_id AND user_id=p_actor AND is_active) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  ELSIF actor_role='student' THEN
    SELECT * INTO r FROM public.homework_recipients WHERE homework_id=h.id AND student_id=p_actor;
    IF NOT FOUND OR h.status='draft' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=h.organization_id AND user_id=p_actor AND is_active) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  ELSE RAISE EXCEPTION 'FORBIDDEN'; END IF;

  IF p_action IN ('save','publish','archive','extend','grade','release','release_all','revise') AND h.owner_id<>p_actor THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_action IN ('start','answers','submit','attach','remove_attachment','hint') AND actor_role<>'student' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  IF p_action='save' THEN
    IF h.status<>'draft' THEN RAISE EXCEPTION 'PUBLISHED_IMMUTABLE'; END IF;
    IF h.version<>(p_payload->>'version')::integer THEN RAISE EXCEPTION 'DRAFT_CONFLICT'; END IF;
    UPDATE public.homeworks SET organization_id=(p_payload->>'organization_id')::uuid,title=p_payload->>'title',instructions=p_payload->>'instructions',questions=p_payload->'questions',objectives=p_payload->'objectives',
      due_at=(p_payload->>'due_at')::timestamptz,close_at=(p_payload->>'close_at')::timestamptz,timezone=p_payload->>'timezone',accept_late=(p_payload->>'accept_late')::boolean,
      allow_hints=(p_payload->>'allow_hints')::boolean,allow_references=(p_payload->>'allow_references')::boolean,minutes=(p_payload->>'minutes')::integer,version=version+1 WHERE id=h.id RETURNING version INTO selected_count;
    UPDATE public.homework_keys SET keys=p_payload->'keys' WHERE homework_id=h.id;
    RETURN jsonb_build_object('id',h.id,'version',selected_count);
  ELSIF p_action='publish' THEN
    IF h.status<>'draft' THEN RAISE EXCEPTION 'PUBLISHED_IMMUTABLE'; END IF;
    IF h.version<>(p_payload->>'version')::integer THEN RAISE EXCEPTION 'DRAFT_CONFLICT'; END IF;
    IF h.due_at<=now() THEN RAISE EXCEPTION 'FUTURE_DEADLINE_REQUIRED'; END IF;
    SELECT array_agg(x::uuid) INTO ids FROM jsonb_array_elements_text(p_payload->'recipients') x;
    IF coalesce(cardinality(ids),0)=0 OR cardinality(ids)>200 THEN RAISE EXCEPTION 'RECIPIENTS_REQUIRED'; END IF;
    IF h.organization_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=h.organization_id AND user_id=p_actor AND is_active)
      THEN RAISE EXCEPTION 'SCHOOL_MEMBERSHIP_REQUIRED'; END IF;
    SELECT count(DISTINCT s.user_id) INTO selected_count FROM public.students s JOIN public.users u ON u.id=s.user_id AND u.role='student'
      JOIN public.organization_members m ON m.user_id=s.user_id AND m.organization_id=h.organization_id AND m.is_active
      WHERE s.user_id=ANY(ids) AND lower(btrim(s.grade))=lower(btrim(h.grade_level));
    IF selected_count<>cardinality(ids) THEN RAISE EXCEPTION 'INELIGIBLE_RECIPIENT'; END IF;
    INSERT INTO public.homework_recipients(homework_id,student_id) SELECT h.id,unnest(ids);
    UPDATE public.homeworks SET status='published',published_at=now(),version=version+1 WHERE id=h.id;
  ELSIF p_action='archive' THEN
    UPDATE public.homeworks SET status='archived',version=version+1 WHERE id=h.id;
  ELSIF p_action='extend' THEN
    IF h.status<>'published' THEN RAISE EXCEPTION 'HOMEWORK_CLOSED'; END IF;
    target=(p_payload->>'studentId')::uuid;due=(p_payload->>'dueAt')::timestamptz;
    IF due<=now() THEN RAISE EXCEPTION 'FUTURE_DEADLINE_REQUIRED'; END IF;
    UPDATE public.homework_recipients SET extension_at=due WHERE homework_id=h.id AND student_id=target;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    UPDATE public.homework_attempts SET revision_due_at=due WHERE homework_id=h.id AND student_id=target AND submitted_at IS NULL AND attempt_number>1;
  ELSIF p_action IN ('start','answers','submit','attach','remove_attachment','hint') THEN
    IF h.status<>'published' THEN RAISE EXCEPTION 'HOMEWORK_CLOSED'; END IF;
    IF p_action='start' THEN
      SELECT * INTO a FROM public.homework_attempts WHERE homework_id=h.id AND student_id=p_actor ORDER BY attempt_number DESC LIMIT 1;
      IF NOT FOUND THEN
        INSERT INTO public.homework_attempts(homework_id,student_id) VALUES(h.id,p_actor) RETURNING * INTO a;
      END IF;
    ELSE
      SELECT * INTO a FROM public.homework_attempts WHERE id=(p_payload->>'attemptId')::uuid AND homework_id=h.id AND student_id=p_actor FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    END IF;
    IF p_action='submit' AND a.submitted_at IS NOT NULL THEN RETURN to_jsonb(a); END IF;
    IF p_action<>'start' AND a.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'ATTEMPT_IMMUTABLE'; END IF;
    due=coalesce(a.revision_due_at,r.extension_at,h.due_at);
    closing=CASE WHEN h.close_at IS NULL THEN NULL ELSE greatest(h.close_at,coalesce(a.revision_due_at,r.extension_at,h.close_at)) END;
    IF (closing IS NOT NULL AND now()>closing) OR (NOT h.accept_late AND now()>due) THEN RAISE EXCEPTION 'HOMEWORK_CLOSED'; END IF;
    IF p_action IN ('answers','submit') THEN
      IF a.version<>(p_payload->>'version')::integer THEN RAISE EXCEPTION 'DRAFT_CONFLICT'; END IF;
      IF p_action='answers' THEN a.answers=p_payload->'answers'; END IF;
      IF jsonb_typeof(a.answers)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(a.answers) x WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(h.questions) q0 WHERE q0->>'id'=x)) THEN RAISE EXCEPTION 'INVALID_ANSWERS'; END IF;
      FOR q IN SELECT * FROM jsonb_array_elements(h.questions) LOOP
        v=a.answers->(q->>'id');
        IF p_action='submit' AND (q->>'required')::boolean AND (v IS NULL OR v='null'::jsonb OR v='""'::jsonb OR v='[]'::jsonb OR (jsonb_typeof(v)='string' AND btrim(v#>>'{}')='')) THEN RAISE EXCEPTION 'REQUIRED_ANSWER'; END IF;
        IF v IS NOT NULL AND v<>'null'::jsonb AND v<>'""'::jsonb THEN
          IF q->>'type'='file' THEN
            IF jsonb_typeof(v)<>'array' OR jsonb_array_length(v)>3 THEN RAISE EXCEPTION 'INVALID_ATTACHMENT'; END IF;
            FOR item IN SELECT * FROM jsonb_array_elements(v) LOOP
              IF NOT EXISTS(SELECT 1 FROM public.homework_attachments WHERE id=(item#>>'{}')::uuid AND homework_id=h.id AND student_id=p_actor AND question_id=q->>'id') THEN RAISE EXCEPTION 'INVALID_ATTACHMENT'; END IF;
            END LOOP;
          ELSIF q->>'type'='multiple_select' THEN
            IF jsonb_typeof(v)<>'array' OR jsonb_array_length(v)>8 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v) choice WHERE jsonb_typeof(choice)<>'string') THEN RAISE EXCEPTION 'INVALID_ANSWERS'; END IF;
            IF NOT(q->'options' @> v) OR (SELECT count(DISTINCT choice) FROM jsonb_array_elements(v) choice)<>jsonb_array_length(v) THEN RAISE EXCEPTION 'INVALID_CHOICE'; END IF;
          ELSIF jsonb_typeof(v)<>'string' THEN RAISE EXCEPTION 'INVALID_ANSWERS';
          ELSIF q->>'type' IN ('multiple_choice','true_false') AND NOT (q->'options' @> jsonb_build_array(v)) THEN RAISE EXCEPTION 'INVALID_CHOICE'; END IF;
        END IF;
      END LOOP;
      IF p_action='answers' THEN
        UPDATE public.homework_attempts SET answers=a.answers,version=version+1 WHERE id=a.id RETURNING * INTO a;
      ELSE
        UPDATE public.homework_attempts SET submitted_at=now(),submitted_due_at=due,late=now()>due,version=version+1 WHERE id=a.id RETURNING * INTO a;
        SELECT keys INTO k FROM public.homework_keys WHERE homework_id=h.id;scores='{}';
        FOR q IN SELECT * FROM jsonb_array_elements(h.questions) WHERE value->>'type' IN ('multiple_choice','multiple_select','true_false') LOOP
          IF q->>'type'='multiple_select' THEN
            v=a.answers->(q->>'id');item=k->(q->>'id')->'correctAnswer';
            score=CASE WHEN v @> item AND item @> v AND jsonb_array_length(item)>0 THEN (q->>'points')::numeric ELSE 0 END;
          ELSE
            score=CASE WHEN a.answers->>(q->>'id')=k->(q->>'id')->>'correctAnswer' THEN (q->>'points')::numeric ELSE 0 END;
          END IF;
          scores=scores||jsonb_build_object(q->>'id',jsonb_build_object('score',score,'feedback',''));
        END LOOP;
        INSERT INTO public.homework_grades(attempt_id,marks,marker_id) VALUES(a.id,scores,h.owner_id);
      END IF;
    ELSIF p_action='hint' THEN
      IF NOT h.allow_hints THEN RAISE EXCEPTION 'HINTS_DISABLED'; END IF;
      UPDATE public.homework_attempts SET hint_count=hint_count+1 WHERE id=a.id RETURNING * INTO a;
    ELSIF p_action='attach' THEN
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(h.questions) WHERE value->>'id'=p_payload->>'questionId' AND value->>'type'='file') THEN RAISE EXCEPTION 'INVALID_ATTACHMENT'; END IF;
      SELECT count(*) INTO selected_count FROM public.homework_attachments WHERE attempt_id=a.id AND question_id=p_payload->>'questionId';
      IF selected_count>=3 OR jsonb_array_length(coalesce(a.answers->(p_payload->>'questionId'),'[]'::jsonb))>=3 THEN RAISE EXCEPTION 'ATTACHMENT_LIMIT'; END IF;
      INSERT INTO public.homework_attachments(homework_id,student_id,attempt_id,question_id,filename,mime_type,byte_size,storage_path)
        VALUES(h.id,p_actor,a.id,p_payload->>'questionId',p_payload->>'filename',p_payload->>'mimeType',(p_payload->>'byteSize')::integer,p_payload->>'path') RETURNING * INTO f;
      -- Link committed uploads atomically so a lost response can be recovered by reloading.
      UPDATE public.homework_attempts SET answers=jsonb_set(answers,ARRAY[f.question_id],coalesce(answers->f.question_id,'[]'::jsonb)||jsonb_build_array(f.id::text)),version=version+1 WHERE id=a.id RETURNING * INTO a;
      RETURN to_jsonb(f)||jsonb_build_object('attempt',to_jsonb(a));
    ELSIF p_action='remove_attachment' THEN
      SELECT * INTO f FROM public.homework_attachments WHERE id=(p_payload->>'attachmentId')::uuid AND attempt_id=a.id AND student_id=p_actor FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
      IF EXISTS(SELECT 1 FROM public.homework_attempts WHERE homework_id=h.id AND submitted_at IS NOT NULL AND answers->f.question_id @> jsonb_build_array(f.id::text)) THEN RAISE EXCEPTION 'ATTEMPT_IMMUTABLE'; END IF;
      DELETE FROM public.homework_attachments WHERE id=f.id;
      UPDATE public.homework_attempts SET answers=jsonb_set(answers,ARRAY[f.question_id],coalesce(answers->f.question_id,'[]'::jsonb)-f.id::text),version=version+1 WHERE id=a.id RETURNING * INTO a;
      RETURN jsonb_build_object('path',f.storage_path,'attempt',to_jsonb(a));
    END IF;
    IF p_action='start' THEN RETURN to_jsonb(a); END IF;
    result=to_jsonb(a);
  ELSIF p_action IN ('grade','release','release_all','revise') THEN
    IF p_action='revise' AND h.status<>'published' THEN RAISE EXCEPTION 'HOMEWORK_CLOSED'; END IF;
    IF p_action='release_all' THEN
      selected_count=0;
      FOR a IN SELECT ha.* FROM public.homework_attempts ha JOIN public.homework_grades hg ON hg.attempt_id=ha.id
        WHERE ha.homework_id=h.id AND ha.submitted_at IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM public.homework_attempts newer WHERE newer.homework_id=ha.homework_id AND newer.student_id=ha.student_id AND newer.attempt_number>ha.attempt_number)
          AND (hg.released_at IS NULL OR hg.released_marks IS DISTINCT FROM hg.marks OR hg.released_feedback IS DISTINCT FROM hg.feedback) LOOP
        SELECT * INTO g FROM public.homework_grades WHERE attempt_id=a.id;
        -- Completed means every question has a mark; partial grading stays private.
        IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(h.questions) WHERE NOT(g.marks ? (value->>'id'))) THEN
          PERFORM public.homework_mutate(p_actor,h.id,'release',jsonb_build_object('attemptId',a.id,'version',g.version));selected_count=selected_count+1;
        END IF;
      END LOOP;
      RETURN jsonb_build_object('released',selected_count);
    END IF;
    SELECT * INTO a FROM public.homework_attempts WHERE id=(p_payload->>'attemptId')::uuid AND homework_id=h.id AND submitted_at IS NOT NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    target=a.student_id;
    SELECT * INTO g FROM public.homework_grades WHERE attempt_id=a.id FOR UPDATE;
    IF g.version<>(p_payload->>'version')::integer THEN RAISE EXCEPTION 'DRAFT_CONFLICT'; END IF;
    IF p_action='grade' THEN
      scores=p_payload->'marks';
      IF jsonb_typeof(scores)<>'object' THEN RAISE EXCEPTION 'INVALID_MARKS'; END IF;
      FOR q IN SELECT * FROM jsonb_array_elements(h.questions) LOOP
        IF scores ? (q->>'id') AND ((scores->(q->>'id')->>'score')::numeric<0 OR (scores->(q->>'id')->>'score')::numeric>(q->>'points')::numeric) THEN RAISE EXCEPTION 'INVALID_MARKS'; END IF;
      END LOOP;
      UPDATE public.homework_grades SET marks=scores,feedback=p_payload->>'feedback',version=version+1,marker_id=p_actor WHERE attempt_id=a.id RETURNING * INTO g;
      result=to_jsonb(g);
    ELSIF p_action='release' THEN
      IF g.released_at IS NOT NULL AND g.released_marks IS NOT DISTINCT FROM g.marks AND g.released_feedback IS NOT DISTINCT FROM g.feedback THEN RETURN to_jsonb(g); END IF;
      FOR q IN SELECT * FROM jsonb_array_elements(h.questions) LOOP
        v=g.marks->(q->>'id');score=(v->>'score')::numeric;
        IF v IS NULL OR score IS NULL OR score<0 OR score>(q->>'points')::numeric THEN RAISE EXCEPTION 'INCOMPLETE_MARKING'; END IF;
        IF jsonb_array_length(q->'rubric')>0 THEN
          IF jsonb_typeof(v->'criteria') IS DISTINCT FROM 'array' OR jsonb_array_length(v->'criteria')<>jsonb_array_length(q->'rubric') THEN RAISE EXCEPTION 'INVALID_RUBRIC'; END IF;
          SELECT sum((x#>>'{}')::numeric) INTO score FROM jsonb_array_elements(v->'criteria') x;
          IF score<>(v->>'score')::numeric THEN RAISE EXCEPTION 'INVALID_RUBRIC'; END IF;
          FOR selected_count IN 0..jsonb_array_length(q->'rubric')-1 LOOP
            IF (v->'criteria'->>selected_count)::numeric<0 OR (v->'criteria'->>selected_count)::numeric>(q->'rubric'->selected_count->>'points')::numeric THEN RAISE EXCEPTION 'INVALID_RUBRIC'; END IF;
          END LOOP;
        END IF;
      END LOOP;
      INSERT INTO public.homework_grade_history(attempt_id,version,marks,feedback,marker_id) VALUES(a.id,g.version,g.marks,g.feedback,p_actor) ON CONFLICT(attempt_id,version) DO NOTHING;
      UPDATE public.homework_grades SET released_at=now(),released_marks=marks,released_feedback=feedback WHERE attempt_id=a.id RETURNING * INTO g;
      result=to_jsonb(g);
    ELSE
      due=(p_payload->>'dueAt')::timestamptz;
      IF due<=now() OR btrim(coalesce(p_payload->>'feedback',''))='' THEN RAISE EXCEPTION 'REVISION_FEEDBACK_REQUIRED'; END IF;
      IF EXISTS(SELECT 1 FROM public.homework_attempts WHERE homework_id=h.id AND student_id=a.student_id AND attempt_number>a.attempt_number) THEN RAISE EXCEPTION 'REVISION_ALREADY_EXISTS'; END IF;
      INSERT INTO public.homework_attempts(homework_id,student_id,attempt_number,answers,revision_feedback,revision_due_at)
        VALUES(h.id,a.student_id,a.attempt_number+1,a.answers,p_payload->>'feedback',due) RETURNING * INTO a;
      result=to_jsonb(a);
    END IF;
  ELSE RAISE EXCEPTION 'UNKNOWN_ACTION'; END IF;
  INSERT INTO public.homework_events(homework_id,actor_id,student_id,kind,payload)
    VALUES(h.id,p_actor,coalesce(target,CASE WHEN actor_role='student' THEN p_actor END),p_action,
      jsonb_build_object('attemptId',a.id,'gradeVersion',g.version,'dueAt',due,'reason',p_payload->>'reason'));
  RETURN coalesce(result,jsonb_build_object('id',h.id));
END $$;
REVOKE ALL ON FUNCTION public.homework_mutate(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.homework_mutate(uuid,uuid,text,jsonb) TO service_role;
