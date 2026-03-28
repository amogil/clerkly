# PR Label Workflow

```
                          Human leaves comments
                          and re-runs Planner
                                +--+
                                |  |
                                v  |
 +-------+    +----------+    +-----------------+
 |  new  |--->| analysis |--->| analysis review |
 +-------+    +----------+    +-----------------+
                Planner          Planner    |
                                            | Human approves plan
                                            v
                                     +----------------+
                                     | ready for work |
                                     +----------------+
                                            |
                                            | Coder (first run)
                                            v
                                     +-------------+
                                     | in progress |
                                     +-------------+
                                       ^    |
                                       |    | Coder finishes
                                       |    v
                                       |  +--------+              +----------------+
                              Reviewer +--| review |------------->| ready for test |
                           finds issues   +--------+              +----------------+
                                                  Reviewer approves
```

## Label Transitions

| Agent    | Entry label                       | Working label  | Final label                       |
|----------|-----------------------------------|----------------|-----------------------------------|
| Planner  | `new` or `analysis review`        | `analysis`     | `analysis review` or `analysis`   |
| (Human)  | `analysis review`                 | —              | `ready for work` (approves) or re-runs Planner (leaves comments) |
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
