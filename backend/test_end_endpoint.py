#!/usr/bin/env python3
"""
Test the /end endpoint flow exactly as it runs in production.
Run inside the Docker container.
"""
import asyncio, json, sys, time, traceback, signal

# timeout handler
def timeout_handler(signum, frame):
    raise TimeoutError("Test timed out!")

sys.path.insert(0, '/app')

log_file = '/app/test_end.log'

def log(msg):
    ts = time.strftime('%H:%M:%S')
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(log_file, 'a') as f:
        f.write(line + '\n')

log("=== TESTING /end ENDPOINT FLOW ===")

from app.db.database import SessionLocal
from app.db.models.candidate import InterviewSession

db = SessionLocal()
try:
    interview_id = 'c952d318-ac30-4b81-838c-4152ce1599c8'
    s = db.query(InterviewSession).filter(InterviewSession.id == interview_id).first()
    if not s:
        log(f"Interview not found: {interview_id}")
        sys.exit(1)
    
    data = json.loads(s.interviewData) if s.interviewData else {}
    log(f"Interview status: {s.status}, result: {s.result}")
    log(f"Has evaluation already: {'evaluation' in data}")
finally:
    db.close()

# Now test the actual functions in order
from app.workflows.interview_graph import interview_graph_manager
from app.services.settings_service import get_evaluation_settings

log("")
log("Step 1: end_interview()")
t0 = time.time()
success = interview_graph_manager.end_interview(interview_id)
log(f"  end_interview: success={success}, took {time.time()-t0:.2f}s")

log("")
log("Step 2: get_evaluation() with 60s timeout")
t1 = time.time()

async def run_eval():
    try:
        result = await asyncio.wait_for(
            interview_graph_manager.get_evaluation(interview_id),
            timeout=60
        )
        elapsed = time.time() - t1
        log(f"  get_evaluation: SUCCESS, took {elapsed:.1f}s")
        log(f"  score={result.get('overall_score') if result else 'None'}")
        return result
    except asyncio.TimeoutError:
        log(f"  get_evaluation: TIMEOUT after 60s")
        return None
    except Exception as e:
        log(f"  get_evaluation: ERROR {type(e).__name__}: {e}")
        traceback.print_exc()
        return None

evaluation = asyncio.run(run_eval())

log("")
log("Step 3: get_evaluation_settings()")
t2 = time.time()
settings = get_evaluation_settings()
log(f"  threshold={settings.get('pass_threshold')}, took {time.time()-t2:.2f}s")

log("")
log("Step 4: computing result")
if evaluation:
    overall_score = evaluation.get("overall_score")
    result = "PASS" if overall_score and overall_score >= settings["pass_threshold"] else "FAIL"
    log(f"  overall_score={overall_score}, result={result}")
else:
    overall_score = 0
    result = "FAIL"
    log(f"  evaluation=None, fallback score=0, result={result}")

log("")
log("=== DONE ===")
log(f"Total time: {time.time()-t0:.1f}s")