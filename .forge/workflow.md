# PR Label Workflow

```
                                                 Human leaves
                                                 inline comments
                                                    +--+
                                                    |  |
                                                    v  |
 +-------+    +----------+    +-----------------+    +----------------+
 |  new  |--->| analysis |--->| analysis review |--->| ready for work |
 +-------+    +----------+    +-----------------+    +----------------+
                Planner          Planner         Human approves
                                                            |
                                                            |  Coder starts
                                                            v
              +----------------+    +--------+    +-------------+
              | ready for test |<---| review |<---| in progress |
              +----------------+    +--------+    +-------------+
                  Reviewer           Coder              ^
                  approves           finishes            |
                                        |               |
                                        +---------------+
                                      Reviewer finds issues
```

## Label Transitions

| Agent    | Entry label                       | Working label  | Final label                       |
|----------|-----------------------------------|----------------|-----------------------------------|
| Planner  | `new`                             | `analysis`     | `analysis review` or `analysis`   |
| (Human)  | `analysis review`                 | —              | `ready for work` (approves) or leaves inline comments (planner re-runs) |
| Coder    | `ready for work` or `in progress` | `in progress`  | `review`                          |
| Reviewer | `review`                          | —              | `ready for test` or `in progress` |

## Label Descriptions

| Label              | Meaning                                    |
|--------------------|--------------------------------------------|
| `new`              | Task not yet started                       |
| `analysis`         | Planner is analyzing the task              |
| `analysis review`  | Plan ready, awaiting human review          |
| `ready for work`   | Human approved the plan, ready for coding  |
| `in progress`      | Coder is implementing                      |
| `review`           | Implementation done, awaiting reviewer     |
| `ready for test`   | Reviewer approved, ready for testing/merge |
