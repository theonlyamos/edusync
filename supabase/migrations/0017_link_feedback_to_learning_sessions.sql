-- Adds a foreign key from feedback.session_id to learning_sessions.id
ALTER TABLE public.feedback
    ADD CONSTRAINT feedback_session_id_fkey
        FOREIGN KEY (session_id)
        REFERENCES public.learning_sessions(id)
        ON DELETE SET NULL;

