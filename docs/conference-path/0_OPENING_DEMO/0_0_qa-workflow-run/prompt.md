# QA workflow run — ticket to pull request in auto mode

## Presentation

![Kostiantyn Teltov](slides/01-kostiantyn-teltov.png)

![DON'T TRY TO UNDERSTAND IT YET JUST WATCH IT WORK](slides/02-dont-try-to-understand-it-yet-just-watch.png)

![Launch future workflow](slides/03-launch-future-workflow.png)

![WE START AT THE END](slides/04-we-start-at-the-end.png)

![THIS TICKET CAME FROM THE FUTURE](slides/05-this-ticket-came-from-the-future.png)

![PREREQUISITES: REPEAT THIS AT HOME](slides/06-prerequisites-repeat-this-at-home.png)

![FUTURE GOAL](slides/07-future-goal.png)

```text
/qa-workflow SCRUM-115 --auto --max-review-iterations 1 --max-design-iterations 1

Run end to end in auto mode. Code review loops: one revision round max per stream
(review -> fix -> re-review); if still Needs Revision after that, escalate, don't loop.
Design review: single pass, ship open findings as approved_with_open_findings.
Finish through the ship step (qa-ship-tests -> git-workflow-orchestrator): branch,
commit, push, open PR against main. Then hand back on Jira: comment PR URL, move to In Review.
Close with node .claude/hooks/metrics-report.mjs SCRUM-<ID>.
```
