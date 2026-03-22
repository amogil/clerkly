# Список задач: LLM Integration

## Обзор

План работ по Issue #78: корректировка anti-flapping score guard для auto-title, чтобы первый rename для дефолтного названия `New Agent` проходил при меньшем пороге, а для уже переименованных чатов сохранялось текущее anti-flap поведение.

**Текущий статус:** Фаза 4 — Runtime/tests завершены, functional run отложен по запросу пользователя

---

## CRITICAL RULES

- Не нарушать существующие guard-правила auto-title (exact match, cooldown, invalid score).
- Для `New Agent` использовать отдельный порог только в рамках score guard; остальные guard-и не ослаблять.
- Не менять UI-контракт `agents`: отображение имени остаётся реакцией на `agent.updated`.
- Не запускать полный `npm run test:functional` без отдельного подтверждения пользователя.

---

## Текущее состояние

### Выполнено
- ✅ Прочитан Issue #78 и подтверждён целевой продуктовый контракт: для `New Agent` rename должен применяться при `rename_need_score > 50`, для остальных заголовков порог остаётся `>= 80`.
- ✅ Повторно проанализированы релевантные спецификации: `llm-integration` (requirements/design), `agents` (requirements/design), `testing-infrastructure` (requirements/design).
- ✅ Подтверждено текущее runtime-поведение: единый score threshold (`80`) задан в `AgentTitleRuntime` без ветки для default-title сценария.
- ✅ Обновлён `llm-integration/requirements.md`: критерий `16.10` синхронизирован под split threshold (`New Agent` -> `> 50`, non-default -> `>= 80`).
- ✅ Обновлён `llm-integration/design.md`: anti-flapping дизайн и тестовое покрытие синхронизированы под split threshold.
- ✅ Кросс-спек consistency проверен с `agents/requirements.md` и `agents/design.md`: изменения UI-контракта не требуются.
- ✅ Обновлён runtime score guard в `src/main/agents/AgentTitleRuntime.ts`:
  - для `New Agent` применяется порог `rename_need_score > 50`;
  - для non-default title сохраняется порог `rename_need_score >= 80`.
- ✅ Расширен unit coverage anti-flapping в `tests/unit/agents/AgentTitleAntiFlap.test.ts`:
  - default title: score `50` -> skip;
  - default title: score `51` -> allow;
  - non-default title: score `79` -> skip.
- ✅ Дополнен `tests/unit/agents/MainPipeline.test.ts`:
  - pipeline применяет rename для default-title при score `51`;
  - pipeline пропускает rename для non-default при score `79`.
- ✅ Прогнаны targeted unit tests:
  - `tests/unit/agents/AgentTitleAntiFlap.test.ts`
  - `tests/unit/agents/MainPipeline.test.ts`
- ✅ Прогнан `npm run validate` (успешно).

### В работе
- 🔄 Полный `npm run test:functional` отложен по явному запросу пользователя для текущего шага.

### Запланировано

#### Фаза 2: Реализация split threshold для auto-title

- [x] Обновить runtime score guard в `src/main/agents/AgentTitleRuntime.ts`.
  - [x] Ввести явный split-порог для default/non-default title.
  - [x] Для текущего title `New Agent` разрешать rename только при `rename_need_score > 50`.
  - [x] Для non-default title сохранить текущее правило `rename_need_score >= 80`.

- [x] Расширить unit coverage anti-flapping в `tests/unit/agents/AgentTitleAntiFlap.test.ts`.
  - [x] Добавить кейс default title: score `50` -> skip.
  - [x] Добавить кейс default title: score `51` -> allow.
  - [x] Оставить regression для non-default title: score `79` -> skip.

- [x] Проверить и при необходимости дополнить `tests/unit/agents/MainPipeline.test.ts`.
  - [x] Зафиксировать, что pipeline применяет rename для default-title сценария при score `51`.
  - [x] Зафиксировать, что для non-default сценария score < `80` остаётся блокирующим.

#### Фаза 3: Синхронизация спецификаций

- [x] Обновить `docs/specs/llm-integration/requirements.md`.
  - [x] Уточнить критерий `16.10` для split threshold (default vs non-default title).
  - [x] Согласовать формулировки с существующими initial-rename и cooldown guard.

- [x] Обновить `docs/specs/llm-integration/design.md`.
  - [x] Отразить split threshold в разделе anti-flapping и в списке unit/functional coverage.

- [x] Проверить кросс-спек consistency с `docs/specs/agents/requirements.md` и `docs/specs/agents/design.md` (без изменения UI-контракта, только при необходимости traceability-уточнений).

#### Фаза 4: Проверка

- [x] Прогнать targeted unit tests:
  - [x] `tests/unit/agents/AgentTitleAntiFlap.test.ts`
  - [x] `tests/unit/agents/MainPipeline.test.ts`
- [x] Прогнать `npm run validate`.
- [ ] Отдельно запросить подтверждение пользователя перед запуском `npm run test:functional`.
