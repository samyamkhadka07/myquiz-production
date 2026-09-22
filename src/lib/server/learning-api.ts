import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidSchema, type Profile } from "@/lib/contracts";
import { check } from "./data";
import { ApiError, admin, staff, superAdmin } from "./auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleReview } from "@/lib/flashcards/scheduler";
import { generateTutorResponse, testAiProvider } from "./ai";
import { processIngestionRun } from "./external-worker";
import { attachMediaPreviews } from "./media-previews";
import { generateActivityArchive, signedArchiveUrl } from "./activity-archives";
export async function learningApi(
  db: SupabaseClient,
  profile: Profile,
  path: string[],
  method: string,
  body: unknown,
  url: URL,
): Promise<{ data: unknown } | null> {
  const [resource, id, operation] = path;
  if (resource === "activity-archives") {
    admin(profile);
    if (operation === "download") {
      if (method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported archive download operation.");
      return { data: { url: await signedArchiveUrl(uuidSchema.parse(id)) } };
    }
    if (method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported archive operation.");
    const p=z.object({period_start:z.iso.date(),period_end:z.iso.date()}).strict().parse(body);
    if (p.period_end >= new Date(Date.now()-14*86400000).toISOString().slice(0,10)) throw new ApiError(400,"ARCHIVE_PERIOD_INVALID","Only activity older than 14 days can be archived.");
    return {data:await generateActivityArchive(p.period_start,p.period_end,profile.id)};
  }
  if (resource === "admin-profile" && method === "PATCH") {
    staff(profile);
    const p = z
      .object({
        display_name: z.string().trim().min(1).max(80),
        timezone: z.string().trim().min(1).max(100),
      })
      .strict()
      .parse(body);
    return {
      data: check(
        await db.rpc("update_admin_profile", { p_name: p.display_name, p_timezone: p.timezone }),
      ),
    };
  }
  if (resource === "learning-games") {
    if (method === "GET")
      return {
        data: check(
          await db
            .from("learning_game_sessions")
            .select("*")
            .eq("user_id", profile.id)
            .order("started_at", { ascending: false })
            .limit(20),
        ),
      };
    if (operation === "answer") {
      const p = z
        .object({
          question_id: uuidSchema,
          answer: z.enum(["A", "B", "C", "D"]),
          rating: z.enum(["KNEW_IT", "ALMOST", "DIDNT_KNOW"]).nullable(),
          response_ms: z.number().int().min(0).max(3600000),
        })
        .strict()
        .parse(body);
      return {
        data: check(
          await db.rpc("answer_learning_game", {
            p_session: uuidSchema.parse(id),
            p_question: p.question_id,
            p_answer: p.answer,
            p_rating: p.rating,
            p_response_ms: p.response_ms,
          }),
        ),
      };
    }
    if (operation === "timeout") {
      return { data: check(await db.rpc("timeout_learning_game_item", { p_session: uuidSchema.parse(id), p_question: uuidSchema.parse((body as { question_id?: unknown }).question_id) })) };
    }
    if (operation === "expire") {
      return { data: check(await db.rpc("expire_learning_game_session", { p_session: uuidSchema.parse(id) })) };
    }
    const p = z
      .object({
        mode: z.enum([
          "RAPID_FIRE",
          "RAPID_RECALL",
          "MEMORY_MATCH",
          "SPEED_CHALLENGE",
          "MISTAKE_RESCUE",
          "ACCURACY",
          "DAILY_CHALLENGE",
        ]),
        count: z.number().int().min(1).max(20),
      })
      .strict()
      .parse(body);
    if (
      ["MISTAKE_RESCUE", "DAILY_CHALLENGE"].includes(p.mode) &&
      !check(await db.rpc("has_entitlement", { p_feature: "premium_games" }))
    )
      throw new ApiError(
        403,
        "PREMIUM_REQUIRED",
        "This learning mode requires an active Premium entitlement.",
      );
    return {
      data: check(await db.rpc("start_learning_game", { p_mode: p.mode, p_count: p.count })),
    };
  }
  if (resource === "study-plan" && method === "PATCH") {
    const p = z.object({ completed: z.boolean() }).strict().parse(body);
    return {
      data: check(
        await db.rpc("set_study_plan_item", {
          p_id: uuidSchema.parse(id),
          p_completed: p.completed,
        }),
      ),
    };
  }
  if (resource === "reading-materials") {
    staff(profile);
    if (method === "GET")
      return {
        data: check(
          await db
            .from("reading_chunks")
            .select("*,contributions(original_filename,category,review_state,object_path)")
            .order("created_at", { ascending: false })
            .limit(100),
        ),
      };
    const p = z.object({ publish: z.boolean() }).strict().parse(body);
    return {
      data: check(
        await db.rpc("review_reading", {
          p_contribution: uuidSchema.parse(id),
          p_publish: p.publish,
        }),
      ),
    };
  }
  if (resource === "dashboard" && method === "GET")
    return { data: check(await db.rpc("get_dashboard")) };
  if (resource === "leaderboard") {
    if (method === "GET") return { data: check(await db.rpc("leaderboard")) };
    const p = z.object({ opt_in: z.boolean() }).strict().parse(body);
    return { data: check(await db.rpc("set_leaderboard_privacy", { p_opt_in: p.opt_in })) };
  }
  if (resource === "flashcards") {
    if (method === "GET")
      return {
        data: check(
          await db
            .from("flashcards")
            .select("*")
            .eq("user_id", profile.id)
            .lte("due", new Date().toISOString())
            .order("due")
            .limit(50),
        ),
      };
    if (operation === "review") {
      const p = z
        .object({
          rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
          request_key: uuidSchema,
        })
        .strict()
        .parse(body);
      const card = check(
        await db
          .from("flashcards")
          .select("*")
          .eq("id", uuidSchema.parse(id))
          .eq("user_id", profile.id)
          .single(),
      ) as {
        id: string;
        state: Parameters<typeof scheduleReview>[0];
        due: string;
        revision: number;
      };
      const result = scheduleReview({ ...card.state, due: card.due }, p.rating, new Date());
      const server = createAdminClient();
      return {
        data: check(
          await server.rpc("commit_flashcard_review", {
            p_user: profile.id,
            p_card: card.id,
            p_rating: p.rating,
            p_state: JSON.parse(JSON.stringify(result.card)),
            p_log: JSON.parse(JSON.stringify(result.log)),
            p_revision: card.revision,
            p_request: p.request_key,
          }),
        ),
      };
    }
    const p = z.object({ question_id: uuidSchema }).strict().parse(body);
    return { data: check(await db.rpc("add_flashcard", { p_question: p.question_id })) };
  }
  if (resource === "comments") {
    if (method === "GET") {
      const page = Math.max(0, Number(url.searchParams.get("page")) || 0);
      let query = db
        .from("comments")
        .select("*")
        .is("question_id", null)
        .order("created_at", { ascending: false })
        .range(page * 50, page * 50 + 49);
      if (id) query = query.eq("id", uuidSchema.parse(id));
      return { data: check(await query) };
    }
    if (operation === "reaction") {
      const p = z
        .object({ reaction: z.enum(["HELPFUL", "THANKS"]).nullable() })
        .strict()
        .parse(body);
      return {
        data: check(
          await db.rpc("react_comment", {
            p_comment: uuidSchema.parse(id),
            p_reaction: p.reaction,
          }),
        ),
      };
    }
    if (operation === "report") {
      const p = z
        .object({ reason: z.string().trim().min(3).max(1000) })
        .strict()
        .parse(body);
      return {
        data: check(
          await db.rpc("report_comment", { p_comment: uuidSchema.parse(id), p_reason: p.reason }),
        ),
      };
    }
    if (operation === "moderate") {
      const p = z
        .object({ action: z.enum(["DELETE", "HIDE", "RESTORE"]) })
        .strict()
        .parse(body);
      return {
        data: check(
          await db.rpc("moderate_comment", { p_comment: uuidSchema.parse(id), p_action: p.action }),
        ),
      };
    }
    const p = z
      .object({
        body: z.string().trim().min(1).max(4000),
        parent_id: uuidSchema.nullable(),
        question_id: uuidSchema.nullable(),
      })
      .strict()
      .parse(body);
    return {
      data: check(
        await db.rpc("write_comment", {
          p_id: id ? uuidSchema.parse(id) : null,
          p_parent: p.parent_id,
          p_question: p.question_id,
          p_body: p.body,
        }),
      ),
    };
  }
  if (resource === "question-media" && method === "GET") {
    const question = uuidSchema.parse(id);
    const links = check(
      await db
        .from("question_media_links")
        .select(
          "media_id,position,alt_text,caption,media_assets(bucket,object_path,mime_type,original_filename)",
        )
        .eq("question_id", question)
        .order("position"),
    ) as Array<Record<string, unknown>>;
    const server = createAdminClient();
    const items = await Promise.all(
      links.map(async (link) => {
        const asset = link.media_assets as unknown as {
          bucket: string;
          object_path: string;
          mime_type: string;
          original_filename: string;
        };
        const signed = check(
          await server.storage.from(asset.bucket).createSignedUrl(asset.object_path, 300),
        );
        return {
          id: link.media_id,
          position: link.position,
          alt_text: link.alt_text,
          caption: link.caption,
          mime_type: asset.mime_type,
          filename: asset.original_filename,
          url: signed.signedUrl,
          expires_in: 300,
        };
      }),
    );
    return { data: items };
  }
  if (resource === "media") {
    staff(profile);
    if (method === "GET") {
      const assets = check(
        await db
          .from("media_assets")
          .select("*,question_media_links(question_id)")
          .order("created_at", { ascending: false })
          .limit(100),
      );
      return { data: await attachMediaPreviews(assets) };
    }
    if (operation === "finalize") {
      const server = createAdminClient();
      check(
        await server.rpc("finalize_media_asset", {
          p_id: uuidSchema.parse(id),
          p_user: profile.id,
        }),
      );
      return { data: true };
    }
    if (operation === "link") {
      const p = z
        .object({
          question_id: uuidSchema,
          position: z.number().int().min(0).max(20),
          alt_text: z.string().trim().min(3).max(500),
          caption: z.string().trim().max(1000).nullable(),
        })
        .strict()
        .parse(body);
      return {
        data: check(
          await db.rpc("set_question_media", {
            p_question: p.question_id,
            p_media: uuidSchema.parse(id),
            p_position: p.position,
            p_alt: p.alt_text,
            p_caption: p.caption,
          }),
        ),
      };
    }
    const p = z
      .object({
        filename: z
          .string()
          .min(1)
          .max(255)
          .refine((v) => !/[\/\\\x00-\x1f]/.test(v)),
        mime: z.enum(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]),
        size: z.number().int().positive().max(20971520),
        alt_text: z.string().trim().min(3).max(500),
        request_key: uuidSchema,
      })
      .strict()
      .parse(body);
    return {
      data: check(
        await db.rpc("create_media_asset", {
          p_filename: p.filename,
          p_mime: p.mime,
          p_size: p.size,
          p_alt: p.alt_text,
          p_request: p.request_key,
        }),
      ),
    };
  }
  if (resource === "contributions") {
    if (method === "GET") {
      let query = db
        .from("contributions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (id) query = query.eq("id", uuidSchema.parse(id));
      return { data: check(await query) };
    }
    if (operation === "finalize") {
      const p = z
        .object({ size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) })
        .strict()
        .parse(body);
      const contributionId = check(
        await createAdminClient().rpc("finalize_contribution", {
          p_id: uuidSchema.parse(id),
          p_user: profile.id,
          p_size: p.size,
        }),
      ) as string;
      return { data: { contribution_id: contributionId, status: "SUBMITTED_FOR_REVIEW" } };
    }
    const p = z
      .object({
        filename: z
          .string()
          .min(1)
          .max(255)
          .refine((v) => !/[\/\\\x00-\x1f]/.test(v)),
        mime: z.enum([
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "text/plain",
          "text/csv",
          "image/png",
          "image/jpeg",
        ]),
        size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        category: z.enum([
          "QUESTIONS",
          "SOLUTIONS",
          "ANSWER_KEYS",
          "NOTES",
          "ESSAYS",
          "READING",
          "PAST_PAPER",
          "MOCK_TEST",
        ]),
        request_key: uuidSchema,
      })
      .strict()
      .parse(body);
    return {
      data: check(
        await db.rpc("create_contribution", {
          p_filename: p.filename,
          p_mime: p.mime,
          p_size: p.size,
          p_category: p.category,
          p_request: p.request_key,
        }),
      ),
    };
  }
  if (resource === "reading" && method === "GET") {
    const search = (url.searchParams.get("q") ?? "").trim();
    let q = db
      .from("reading_chunks")
      .select("id,contribution_id,page_number,chunk_index,content,title,created_at")
      .eq("publication_status", "PUBLISHED")
      .order("created_at", { ascending: false })
      .limit(100);
    if (search) q = q.textSearch("search_vector", search, { type: "websearch" });
    return { data: check(await q) };
  }
  if (resource === "staged") {
    staff(profile);
    if (method === "GET")
      return {
        data: check(
          await db
            .from("staged_items")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(100),
        ),
      };
    const p = z
      .object({
        action: z.enum(["IMPORT", "IMPORT_VERIFY", "IMPORT_PUBLISH", "REJECT", "NEEDS_REVISION"]),
        data: z.record(z.string(), z.unknown()).nullable(),
      })
      .strict()
      .parse(body);
    return {
      data: check(
        await db.rpc("review_staged_item", {
          p_id: uuidSchema.parse(id),
          p_action: p.action,
          p_data: p.data,
        }),
      ),
    };
  }
  if (resource === "reports") {
    staff(profile);
    const p = z
      .object({ action: z.enum(["DISMISS", "HIDE", "DELETE"]) })
      .strict()
      .parse(body);
    return {
      data: check(
        await db.rpc("resolve_report", { p_id: uuidSchema.parse(id), p_action: p.action }),
      ),
    };
  }
  if (resource === "contribution-review") {
    staff(profile);
    const p = z
      .object({ action: z.enum(["APPROVE", "REJECT", "NEEDS_REVISION", "REOPEN"]) })
      .strict()
      .parse(body);
    return {
      data: check(
        await db.rpc("review_contribution", { p_id: uuidSchema.parse(id), p_action: p.action }),
      ),
    };
  }
  if (resource === "download" && method === "POST") {
    staff(profile);
    const contribution = check(
      await db
        .from("contributions")
        .select("id,bucket,object_path")
        .eq("id", uuidSchema.parse(id))
        .single(),
    ) as { id: string; bucket: string; object_path: string };
    const server = createAdminClient();
    const signed = check(
      await server.storage.from(contribution.bucket).createSignedUrl(contribution.object_path, 120),
    );
    check(
      await server.from("audit_events").insert({
        actor_id: profile.id,
        action: "ORIGINAL_DOWNLOADED",
        target_type: "contribution",
        target_id: contribution.id,
      }),
    );
    return { data: { url: signed.signedUrl, expires_in: 120 } };
  }
  if (resource === "sources") {
    staff(profile);
    if (method === "GET")
      return {
        data: check(
          await db
            .from("external_sources")
            .select("*,ingestion_runs(*)")
            .order("created_at", { ascending: false })
            .limit(100),
        ),
      };
    if (operation === "scan") {
      const run = check(
        await db.rpc("queue_ingestion", { p_source: uuidSchema.parse(id) }),
      ) as string;
      await processIngestionRun(run);
      return { data: { run_id: run } };
    }
    admin(profile);
    const p = z
      .object({
        platform: z.literal("META"),
        source_type: z.literal("PAGE"),
        source_identifier: z.string().min(1).max(200),
        canonical_url: z.url(),
        label: z.string().min(1).max(200),
        enabled: z.boolean(),
        authorization_state: z.enum(["UNVERIFIED", "AUTHORIZED", "REVOKED", "ERROR"]),
      })
      .strict()
      .parse(body);
    return {
      data: check(
        await db.rpc("save_external_source", { p_id: id ? uuidSchema.parse(id) : null, p_data: p }),
      ),
    };
  }
  if (resource === "learning" && method === "POST") {
    const p = z
      .object({
        activity: z.enum([
          "EXPLAIN_SIMPLER",
          "EXPLAIN_DEEPER",
          "WHY_WRONG",
          "STEP_BY_STEP",
          "ANALOGY",
          "NEPALI",
          "MNEMONIC",
          "FOLLOWUP",
        ]),
        attempt_id: uuidSchema,
        question_id: uuidSchema,
        language: z.enum(["en", "ne"]).default("en"),
        followup: z.string().trim().min(3).max(600).nullable().default(null),
      })
      .strict()
      .parse(body);
    if (!check(await db.rpc("has_entitlement", { p_feature: "ai_tutor" })))
      throw new ApiError(403, "ENTITLEMENT_REQUIRED", "Your current plan does not include AI tutoring.");
    if (
      p.activity === "NEPALI" &&
      !check(await db.rpc("has_entitlement", { p_feature: "ai_nepali" }))
    )
      throw new ApiError(403, "ENTITLEMENT_REQUIRED", "Your current plan does not include Nepali AI explanations.");
    if (
      p.activity === "MNEMONIC" &&
      !check(await db.rpc("has_entitlement", { p_feature: "ai_mnemonics" }))
    )
      throw new ApiError(403, "ENTITLEMENT_REQUIRED", "Your current plan does not include AI mnemonics.");
    if (p.activity === "FOLLOWUP" && !check(await db.rpc("has_entitlement", { p_feature: "ai_followups" })))
      throw new ApiError(403, "ENTITLEMENT_REQUIRED", "Your current plan does not include AI follow-ups.");
    if (p.activity === "FOLLOWUP" && !p.followup)
      throw new ApiError(400, "VALIDATION_FAILED", "Enter a follow-up question.");
    const server = createAdminClient();
    const attempt = check(
      await server
        .from("attempts")
        .select("id,user_id,status")
        .eq("id", p.attempt_id)
        .eq("user_id", profile.id)
        .single(),
    ) as { id: string; user_id: string; status: string };
    if (!["COMPLETED", "EXPIRED"].includes(attempt.status))
      throw new ApiError(
        403,
        "TUTOR_LOCKED",
        "AI tutoring unlocks only after this test is submitted.",
      );
    const [questionResult, keyResult, versionResult] = await Promise.all([
      server
        .from("attempt_questions")
        .select("snapshot,selected_answer")
        .eq("attempt_id", p.attempt_id)
        .eq("question_id", p.question_id)
        .single(),
      server
        .from("attempt_question_keys")
        .select("correct_answer,explanation,option_explanations")
        .eq("attempt_id", p.attempt_id)
        .eq("question_id", p.question_id)
        .single(),
      server
        .from("question_versions")
        .select("id", { count: "exact", head: true })
        .eq("question_id", p.question_id),
    ]);
    const question = check(questionResult) as {
      snapshot: Record<string, unknown>;
      selected_answer: "A" | "B" | "C" | "D" | null;
    };
    const key = check(keyResult) as {
      correct_answer: "A" | "B" | "C" | "D";
      explanation: string;
      option_explanations: Record<string, string>;
    };
    const snapshot = question.snapshot;
    return {
      data: await generateTutorResponse({
        userId: profile.id,
        action: p.activity,
        language: p.language,
        followup: p.followup ?? undefined,
        context: {
          questionId: p.question_id,
          questionVersion: (versionResult.count ?? 0) + 1,
          questionText: String(snapshot.question_text ?? ""),
          options: {
            A: String(snapshot.option_a ?? ""),
            B: String(snapshot.option_b ?? ""),
            C: String(snapshot.option_c ?? ""),
            D: String(snapshot.option_d ?? ""),
          },
          correctAnswer: key.correct_answer,
          selectedAnswer: question.selected_answer,
          canonicalExplanation: p.activity === "FOLLOWUP" ? `${key.explanation}\n\nLearner follow-up: ${p.followup}` : key.explanation,
          optionExplanations: key.option_explanations,
          difficulty: String(snapshot.difficulty ?? ""),
          cognitiveLevel: String(snapshot.cognitive_level ?? ""),
        },
      }),
    };
  }
  if (resource === "entitlement-overrides") {
    admin(profile);
    if (method === "GET") {
      const user = url.searchParams.get("user");
      let query = db
        .from("entitlement_feature_overrides")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (user) query = query.eq("user_id", uuidSchema.parse(user));
      return { data: check(await query) };
    }
    if (method === "DELETE") {
      return {
        data: check(
          await db.rpc("revoke_feature_override", { p_id: uuidSchema.parse(id) }),
        ),
      };
    }
    const p = z
      .object({
        user_id: uuidSchema,
        feature: z.string().trim().regex(/^[a-z0-9_]+$/),
        allowed: z.boolean(),
        starts_at: z.iso.datetime().nullable(),
        ends_at: z.iso.datetime().nullable(),
        reason: z.string().trim().max(500).nullable(),
      })
      .strict()
      .parse(body);
    return {
      data: check(
        await db.rpc("set_feature_override", {
          p_user: p.user_id,
          p_feature: p.feature,
          p_allowed: p.allowed,
          p_starts: p.starts_at,
          p_ends: p.ends_at,
          p_reason: p.reason,
        }),
      ),
    };
  }
  if (resource === "entitlement-grants") {
    admin(profile);
    if (method === "GET") {
      const user = url.searchParams.get("user");
      let query = db
        .from("entitlement_feature_grants")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (user) query = query.eq("user_id", uuidSchema.parse(user));
      return { data: check(await query) };
    }
    if (method === "DELETE") {
      return {
        data: check(await db.rpc("revoke_feature_grant", { p_id: uuidSchema.parse(id) })),
      };
    }
    const p = z
      .object({
        user_id: uuidSchema,
        kind: z.enum(["TRIAL", "PROMOTIONAL"]),
        features: z.array(z.string().trim().regex(/^[a-z0-9_]+$/)).min(1).max(100),
        starts_at: z.iso.datetime().nullable(),
        ends_at: z.iso.datetime(),
        reason: z.string().trim().max(500).nullable(),
      })
      .strict()
      .parse(body);
    return {
      data: check(
        await db.rpc("grant_feature_access", {
          p_user: p.user_id,
          p_kind: p.kind,
          p_features: p.features,
          p_starts: p.starts_at,
          p_ends: p.ends_at,
          p_reason: p.reason,
        }),
      ),
    };
  }
  if (resource === "subscription-plans") {
    if (method === "GET")
      return {
        data: check(
          await db.from("subscription_plans").select("*").order("display_order").order("price_npr"),
        ),
      };
    admin(profile);
    const p = z
      .object({
        code: z
          .string()
          .trim()
          .regex(/^[A-Z0-9_]+$/)
          .optional(),
        name: z.string().trim().min(2).max(80),
        description: z.string().trim().max(500),
        price_npr: z.number().min(0).max(1000000),
        duration_days: z.number().int().min(1).max(3660).nullable(),
        features: z
          .array(
            z
              .string()
              .trim()
              .regex(/^[a-z0-9_]+$/),
          )
          .max(100),
        ai_daily_limit: z.number().int().min(0).max(1000),
        marketing_text: z.string().trim().max(500),
        display_order: z.number().int().min(0).max(10000),
        recommended: z.boolean(),
        enabled: z.boolean(),
      })
      .strict()
      .parse(body);
    if (!id && !p.code)
      throw new ApiError(400, "PLAN_CODE_REQUIRED", "A code is required for a new plan.");
    return {
      data: check(
        await db.rpc("save_subscription_plan", {
          p_id: id ? uuidSchema.parse(id) : null,
          p_data: p,
        }),
      ),
    };
  }
  if (resource === "ai-settings") {
    admin(profile);
    if (method === "GET")
      return {
        data: check(await db.from("ai_tutor_settings").select("*").eq("id", true).single()),
      };
    const p = z
      .object({
        enabled: z.boolean(),
        provider: z.enum(["disabled", "openai", "openrouter", "ollama", "gemini", "groq"]),
        model: z.string().trim().min(1).max(100),
        free_daily_limit: z.number().int().min(0).max(100),
        global_daily_limit: z.number().int().min(0).max(100000),
        global_monthly_limit: z.number().int().min(0).max(1000000),
        timeout_ms: z.number().int().min(1000).max(30000),
        max_output_tokens: z.number().int().min(100).max(2000),
        nepali_enabled: z.boolean(),
        followups_enabled: z.boolean(),
        maintenance_message: z.string().trim().min(10).max(500),
      })
      .strict()
      .parse(body);
    return {
      data: check(
        await db
          .from("ai_tutor_settings")
          .update({ ...p, updated_at: new Date().toISOString(), updated_by: profile.id })
          .eq("id", true)
          .select()
          .single(),
      ),
    };
  }
  if (resource === "ai-provider-test") {
    admin(profile);
    if (method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Provider tests require POST.");
    const p = z.object({ provider: z.enum(["openrouter", "gemini", "groq", "ollama", "openai"]) }).strict().parse(body);
    return { data: await testAiProvider(p.provider) };
  }
  if (resource === "payment-methods") {
    if (method === "GET")
      return {
        data: check(
          await db.from("payment_methods").select("*").order("display_order").order("name"),
        ),
      };
    admin(profile);
    const p = z
      .object({
        code: z
          .string()
          .trim()
          .regex(/^[A-Z0-9_]+$/)
          .optional(),
        name: z.string().trim().min(2).max(80),
        enabled: z.boolean(),
        qr_object_path: z.string().trim().max(500).nullable(),
        display_name: z.string().trim().max(120).nullable(),
        instructions: z.string().trim().max(1000).nullable(),
        account_identifier: z.string().trim().max(120).nullable(),
        verification_instructions: z.string().trim().max(1000).nullable(),
        display_order: z.number().int().min(0).max(10000),
      })
      .strict()
      .parse(body);
    if (!id && !p.code)
      throw new ApiError(400, "PAYMENT_CODE_REQUIRED", "A code is required for a new method.");
    return {
      data: check(
        await db.rpc("save_payment_method", {
          p_id: id ? uuidSchema.parse(id) : null,
          p_data: p,
        }),
      ),
    };
  }
  if (resource === "payment-requests") {
    if (method === "GET") {
      const query = db
        .from("payment_requests")
        .select("*,subscription_plans(name,code),payment_methods(name,code)")
        .order("submitted_at", { ascending: false })
        .limit(100);
      return {
        data: check(await (profile.role === "STUDENT" ? query.eq("user_id", profile.id) : query)),
      };
    }
    if (!id) {
      const p = z
        .object({
          plan_id: uuidSchema,
          payment_method_id: uuidSchema,
          reference_id: z.string().trim().min(3).max(120),
          note: z.string().trim().max(1000).nullable(),
          receipt_object_path: z.string().trim().max(500),
        })
        .strict()
        .parse(body);
      return {
        data: check(
          await db.rpc("submit_payment_request", {
            p_plan: p.plan_id,
            p_method: p.payment_method_id,
            p_reference: p.reference_id,
            p_note: p.note,
            p_receipt_object_path: p.receipt_object_path,
          }),
        ),
      };
    }
    admin(profile);
    const p = z
      .object({
        action: z.enum(["APPROVE", "REJECT", "REQUEST_CLARIFICATION"]),
        note: z.string().trim().max(1000).nullable(),
      })
      .strict()
      .parse(body);
    return {
      data: check(
        await db.rpc("review_payment_request", {
          p_request: uuidSchema.parse(id),
          p_action: p.action,
          p_note: p.note,
        }),
      ),
    };
  }
  if (resource === "subscription-notifications") {
    if (method === "GET") return {data:check(await db.from("subscription_notifications").select("*").eq("user_id",profile.id).is("dismissed_at",null).order("created_at",{ascending:false}).limit(20))};
    const p=z.object({action:z.enum(["READ","DISMISS"])}).strict().parse(body);
    return {data:check(await db.rpc("update_subscription_notification",{p_id:uuidSchema.parse(id),p_action:p.action}))};
  }
  if (resource === "subscription-notification-send") {
    admin(profile); const p=z.object({subscription_id:uuidSchema,notification_type:z.enum(["EXPIRING_7_DAYS","EXPIRING_3_DAYS","EXPIRING_TODAY","EXPIRED"]),message:z.string().trim().max(500).nullable()}).strict().parse(body);
    return {data:check(await db.rpc("send_subscription_notification",{p_subscription:p.subscription_id,p_type:p.notification_type,p_message:p.message}))};
  }
  if (resource === "subscriptions" && operation === "revoke") {
    admin(profile); const p=z.object({reason:z.string().trim().min(3).max(1000)}).strict().parse(body);
    return {data:check(await db.rpc("revoke_subscription",{p_subscription:uuidSchema.parse(id),p_reason:p.reason}))};
  }
  if (resource === "users") {
    superAdmin(profile);
    if (operation === "lifecycle") {
      if (method !== "POST")
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported account lifecycle operation.");
      const p = z
        .object({
          action: z.enum(["DEACTIVATE", "REACTIVATE"]),
          reason: z.string().trim().min(3).max(1000),
        })
        .strict()
        .parse(body);
      const target = uuidSchema.parse(id);
      return {
        data: check(
          await db.rpc("set_account_status", {
            p_user: target,
            p_status: p.action === "DEACTIVATE" ? "DEACTIVATED" : "ACTIVE",
            p_reason: p.reason,
          }),
        ),
      };
    }
    if (operation === "delete") {
      if (method !== "DELETE")
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported account deletion operation.");
      const p = z.object({ confirmation: z.string().trim().min(8).max(200) }).strict().parse(body);
      const target = uuidSchema.parse(id);
      check(await db.rpc("prepare_account_deletion", { p_user: target, p_confirmation: p.confirmation }));
      const result = await createAdminClient().auth.admin.deleteUser(target);
      if (result.error)
        throw new ApiError(500, "ACCOUNT_DELETE_FAILED", "The account could not be permanently deleted.");
      return { data: { deleted: true } };
    }
    if (method === "GET")
      return {
        data: check(
          await db
            .from("profiles")
            .select("id,display_name,role,created_at,entitlements(tier,ends_at)")
            .order("created_at", { ascending: false })
            .limit(100),
        ),
      };
    if (method !== "PATCH")
      throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported user operation.");
    const p = z
      .object({
        role: z.enum(["STUDENT", "MODERATOR", "ADMIN"]),
        tier: z.enum(["FREE", "PREMIUM"]),
        ends_at: z.iso.datetime().nullable(),
      })
      .strict()
      .parse(body);
    return {
      data: check(
        await db.rpc("set_user_access", {
          p_user: uuidSchema.parse(id),
          p_role: p.role,
          p_tier: p.tier,
          p_ends: p.ends_at,
        }),
      ),
    };
  }
  if (resource === "admin-requests") {
    superAdmin(profile);
    if (method === "GET")
      return {
        data: check(
          await db
            .from("admin_role_requests")
            .select(
              "id,user_id,status,requested_at,reviewed_at,decision_note,profiles!admin_role_requests_user_id_fkey(display_name,role)",
            )
            .order("requested_at", { ascending: false })
            .limit(100),
        ),
      };
    if (method !== "PATCH")
      throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported admin-request operation.");
    const p = z
      .object({
        decision: z.enum(["APPROVE", "REJECT"]),
        note: z.string().trim().max(1000).nullable(),
      })
      .strict()
      .parse(body);
    return {
      data: check(
        await db.rpc("review_admin_request", {
          p_request: uuidSchema.parse(id),
          p_decision: p.decision,
          p_note: p.note,
        }),
      ),
    };
  }
  return null;
}
