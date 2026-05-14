# Database Schema

## users

- id
- email
- hashed_password
- created_at

---

## candidates

- id
- user_id
- resume_url
- interview_status
- final_score
- summary

---

## interviews

- id
- candidate_id
- started_at
- completed_at
- status
