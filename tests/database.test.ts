import { beforeAll, afterAll, describe, it, expect } from "vitest";
import fs from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
// The harness models Supabase's auth/storage schemas; application SQL is unmodified.
// @ts-expect-error JavaScript test harness intentionally excluded from application types.
import { database, asUser } from "./database.mjs";
let db: PGlite;
let program: string;
let subject: string;
let unit: string;
let question: string;
let attempt: string;
let attemptQuestion: string;
let attemptExplanation: string;
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  admin = "33333333-3333-4333-8333-333333333333",
  superAdmin = "66666666-6666-4666-8666-666666666666",
  requester = "77777777-7777-4777-8777-777777777777",
  rejectedRequester = "88888888-8888-4888-8888-888888888888";
const as = (id: string, query: string, params: unknown[] = []) =>
  asUser(db, id, query, params) as Promise<{ rows: Record<string, unknown>[] }>;
beforeAll(async () => {
  db = await database();
  await db.query(
    "insert into auth.users(id,email,raw_user_meta_data) values($1,'student-a@test.invalid','{\"role\":\"ADMIN\"}'),($2,'student-b@test.invalid','{}'),($3,'admin@test.invalid','{}'),($4,'super-admin@test.invalid','{}'),($5,'requester@test.invalid','{\"requested_account_type\":\"ADMIN\",\"role\":\"SUPER_ADMIN\"}'),($6,'rejected@test.invalid','{\"requested_account_type\":\"ADMIN\"}')",
    [a, b, admin, superAdmin, requester, rejectedRequester],
  );
  await db.query("update profiles set role='ADMIN' where id=$1", [admin]);
  await db.query("update profiles set role='SUPER_ADMIN' where id=$1", [superAdmin]);
  program = (await db.query<{ id: string }>("select id from exam_programs where code='MBBS'"))
    .rows[0]!.id;
  const row = (
    await db.query<{ id: string; subject_id: string }>(
      "select id,subject_id from units where code='Z1'",
    )
  ).rows[0]!;
  unit = row.id;
  subject = row.subject_id;
});
afterAll(async () => {
  await db?.close();
});
describe.sequential("migration, lifecycle, quiz and isolation evidence", () => {
  it("runs all migrations, then re-seeds without duplicating academic records", async () => {
    const before = (await db.query("select count(*) from topics")).rows;
    await db.exec(fs.readFileSync("supabase/migrations/0006_mec_complete_seed.sql", "utf8"));
    expect((await db.query("select count(*) from topics")).rows).toEqual(before);
    expect((await db.query("select count(*)::int n from exam_programs")).rows[0]).toEqual({
      n: 16,
    });
  });
  it("ignores role metadata on registration", async () =>
    expect((await as(a, "select role from profiles where id=auth.uid()")).rows[0]?.role).toBe(
      "STUDENT",
    ));
  it("persists first-login program, target and self-assessed focus securely", async () => {
    await as(a, "select complete_student_onboarding($1,150,array[$2]::uuid[])", [program, subject]);
    expect(
      (
        await as(
          a,
          "select exam_program_id,target_score::float,self_assessed_weak_subject_ids,onboarding_completed_at is not null completed from profiles where id=auth.uid()",
        )
      ).rows[0],
    ).toEqual({
      exam_program_id: program,
      target_score: 150,
      self_assessed_weak_subject_ids: [subject],
      completed: true,
    });
    await expect(
      as(b, "select complete_student_onboarding($1,250,array[]::uuid[])", [program]),
    ).rejects.toThrow(/target score/i);
  });
  it("records an Admin choice as a pending request without granting the role", async () => {
    expect(
      (await as(requester, "select role from profiles where id=auth.uid()")).rows[0]?.role,
    ).toBe("STUDENT");
    expect(
      (await as(requester, "select status from admin_role_requests where user_id=auth.uid()"))
        .rows[0]?.status,
    ).toBe("PENDING");
    expect((await as(a, "select * from admin_role_requests")).rows).toHaveLength(0);
  });
  it("blocks direct self promotion and admin RPC abuse", async () => {
    await expect(as(a, "update profiles set role='ADMIN' where id=auth.uid()")).rejects.toThrow();
    await expect(as(a, "select set_user_access($1,'ADMIN','PREMIUM',null)", [a])).rejects.toThrow();
  });
  it("allows only a Super Admin to approve an Admin request", async () => {
    const request = (
      await as(requester, "select id from admin_role_requests where user_id=auth.uid()")
    ).rows[0]!.id;
    await expect(
      as(admin, "select review_admin_request($1,'APPROVE',null)", [request]),
    ).rejects.toThrow(/Super Admin/);
    await expect(as(admin, "select set_user_access($1,'ADMIN','FREE',null)", [b])).rejects.toThrow(
      /Super Admin/,
    );
    await as(superAdmin, "select review_admin_request($1,'APPROVE','Verified fixture request')", [
      request,
    ]);
    expect(
      (await as(requester, "select role from profiles where id=auth.uid()")).rows[0]?.role,
    ).toBe("ADMIN");
    expect(
      (
        await as(superAdmin, "select status,reviewed_by from admin_role_requests where id=$1", [
          request,
        ])
      ).rows[0],
    ).toEqual({ status: "APPROVED", reviewed_by: superAdmin });
    await expect(
      as(superAdmin, "select review_admin_request($1,'APPROVE',null)", [request]),
    ).rejects.toThrow(/already reviewed/);
  });
  it("persists rejection without granting Admin access", async () => {
    const request = (
      await as(rejectedRequester, "select id from admin_role_requests where user_id=auth.uid()")
    ).rows[0]!.id;
    await as(superAdmin, "select review_admin_request($1,'REJECT','Request not approved')", [
      request,
    ]);
    expect(
      (await as(rejectedRequester, "select role from profiles where id=auth.uid()")).rows[0]?.role,
    ).toBe("STUDENT");
    expect(
      (
        await as(
          rejectedRequester,
          "select status,decision_note from admin_role_requests where id=$1",
          [request],
        )
      ).rows[0],
    ).toEqual({ status: "REJECTED", decision_note: "Request not approved" });
  });
  it("protects the permanent Super Admin from demotion by role APIs", async () => {
    await expect(
      as(superAdmin, "select set_user_access($1,'STUDENT','FREE',null)", [superAdmin]),
    ).rejects.toThrow(/Self role changes/);
    expect(
      (await as(superAdmin, "select role from profiles where id=auth.uid()")).rows[0]?.role,
    ).toBe("SUPER_ADMIN");
  });
  it("blocks anonymous access to protected operations", async () => {
    await db.exec("set role anon");
    try {
      await expect(
        db.query("select start_attempt($1,'TOPIC',1,null,null,gen_random_uuid())", [program]),
      ).rejects.toThrow();
      await expect(db.query("select * from attempt_question_keys")).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
  });
  it("creates and persists a staged canonical question", async () => {
    const p = {
      question_text: "TEST FIXTURE: select the first symbol.",
      option_a: "Alpha",
      option_b: "Beta",
      option_c: "Gamma",
      option_d: "Delta",
      correct_answer: "A",
      explanation: "Fixture explanation.",
      option_explanations: { A: "First", B: "Second", C: "Third", D: "Fourth" },
      subject_id: subject,
      unit_id: unit,
      difficulty: "EASY",
      cognitive_level: "RECALL",
      source_type: "MANUAL",
    };
    question = (await as(admin, "select save_question(null,$1::jsonb) id", [JSON.stringify(p)]))
      .rows[0]!.id as string;
    expect(
      (await as(admin, "select lifecycle from questions where id=$1", [question])).rows[0]
        ?.lifecycle,
    ).toBe("STAGED");
    await expect(
      as(admin, "select save_question(null,$1::jsonb)", [JSON.stringify(p)]),
    ).rejects.toThrow(/unique|duplicate/i);
  });
  it("versions meaningful question edits and restores safely to staging", async () => {
    const updated = {
      question_text: "TEST FIXTURE: select the updated first symbol.",
      option_a: "Alpha",
      option_b: "Beta",
      option_c: "Gamma",
      option_d: "Delta",
      correct_answer: "A",
      explanation: "Updated fixture explanation.",
      option_explanations: { A: "First", B: "Second", C: "Third", D: "Fourth" },
      subject_id: subject,
      unit_id: unit,
      topic_id: null,
      exam_program_id: null,
      difficulty: "EASY",
      cognitive_level: "RECALL",
      source_type: "MANUAL",
      source_year: null,
      source_document: null,
      source_url: null,
      source_page: null,
      source_question_number: null,
      provenance: { fixture: true },
    };
    await as(admin, "select save_question($1,$2::jsonb)", [question, JSON.stringify(updated)]);
    const version = (
      await as(
        admin,
        "select id,version_number,question_snapshot->>'question_text' old_text from question_versions where question_id=$1",
        [question],
      )
    ).rows[0]!;
    expect(version).toMatchObject({
      version_number: 1,
      old_text: "TEST FIXTURE: select the first symbol.",
    });
    await as(admin, "select restore_question_version($1,$2)", [question, version.id]);
    expect(
      (
        await as(
          admin,
          "select question_text,lifecycle,verification_status,publication_status from questions where id=$1",
          [question],
        )
      ).rows[0],
    ).toEqual({
      question_text: "TEST FIXTURE: select the first symbol.",
      lifecycle: "STAGED",
      verification_status: "UNVERIFIED",
      publication_status: "DRAFT",
    });
    expect(
      (
        await as(admin, "select count(*)::int n from question_versions where question_id=$1", [
          question,
        ])
      ).rows[0],
    ).toEqual({ n: 2 });
  });
  it("can deliberately import, verify and publish a complete staged visual question", async () => {
    const media = (
      await db.query<{ id: string }>(
        "insert into media_assets(uploaded_by,upload_key,object_path,original_filename,mime_type,byte_size,default_alt_text,status) values($1,gen_random_uuid(),'fixture/page-2.png','page-2.png','image/png',100,'A controlled academic figure','ACTIVE') returning id",
        [admin],
      )
    ).rows[0]!.id;
    const p = {
      question_text: "TEST FIXTURE: staged publish path.",
      option_a: "One",
      option_b: "Two",
      option_c: "Three",
      option_d: "Four",
      correct_answer: "A",
      explanation: "One is the verified fixture answer.",
      option_explanations: {
        A: "This is correct.",
        B: "This does not match the fixture.",
        C: "This does not match the fixture.",
        D: "This does not match the fixture.",
      },
      subject_id: subject,
      unit_id: unit,
      topic_id: null,
      exam_program_id: program,
      difficulty: "EASY",
      cognitive_level: "RECALL",
      source_type: "CONTRIBUTION",
      source_year: 2083,
      source_document: "fixture.docx",
      source_url: null,
      source_page: 2,
      source_question_number: "1",
      provenance: { fixture: true, media_asset_ids: [media] },
    };
    const staged = (
      await db.query<{ id: string }>(
        "insert into staged_items(source_key,question_data,validation_errors) values('fixture:publish',$1::jsonb,'[]') returning id",
        [JSON.stringify(p)],
      )
    ).rows[0]!.id;
    const imported = (
      await as(admin, "select review_staged_item($1,'IMPORT_PUBLISH',$2::jsonb) id", [
        staged,
        JSON.stringify(p),
      ])
    ).rows[0]!.id;
    expect(
      (
        await as(
          admin,
          "select lifecycle,verification_status,publication_status from questions where id=$1",
          [imported],
        )
      ).rows[0],
    ).toEqual({
      lifecycle: "PUBLISHED",
      verification_status: "VERIFIED",
      publication_status: "PUBLISHED",
    });
    expect(
      (
        await as(admin, "select status,canonical_question_id from staged_items where id=$1", [
          staged,
        ])
      ).rows[0],
    ).toEqual({ status: "IMPORTED", canonical_question_id: imported });
    expect(
      (
        await as(admin, "select media_id from question_media_links where question_id=$1", [
          imported,
        ])
      ).rows[0]?.media_id,
    ).toBe(media);
  });
  it("enforces granular plan features, overrides, grants, and legacy Premium compatibility", async () => {
    expect((await as(a, "select has_entitlement('adaptive_practice') allowed")).rows[0]).toEqual({
      allowed: false,
    });
    await expect(
      as(
        a,
        "select start_attempt($1,'ADAPTIVE',1,null,null,'dddddddd-dddd-4ddd-8ddd-dddddddddddd')",
        [program],
      ),
    ).rejects.toThrow(/Adaptive practice entitlement/i);

    const allow = (
      await as(
        superAdmin,
        "select set_feature_override($1,'adaptive_practice',true,now(),null,'Adaptive regression fixture') id",
        [a],
      )
    ).rows[0]!.id;
    expect((await as(a, "select has_entitlement('adaptive_practice') allowed")).rows[0]).toEqual({
      allowed: true,
    });
    const deny = (
      await as(
        superAdmin,
        "select set_feature_override($1,'adaptive_practice',false,now(),null,'Temporary deny fixture') id",
        [a],
      )
    ).rows[0]!.id;
    expect((await as(a, "select has_entitlement('adaptive_practice') allowed")).rows[0]).toEqual({
      allowed: false,
    });
    await as(superAdmin, "select revoke_feature_override($1)", [deny]);
    await as(
      superAdmin,
      "select set_feature_override($1,'adaptive_practice',true,now(),null,'Restore adaptive fixture')",
      [a],
    );

    await as(
      superAdmin,
      "select grant_feature_access($1,'TRIAL',jsonb_build_array('adaptive_practice'),now(),now()+interval '1 hour','Trial fixture')",
      [b],
    );
    expect((await as(b, "select has_entitlement('adaptive_practice') allowed")).rows[0]).toEqual({
      allowed: true,
    });
    await as(
      superAdmin,
      "select grant_feature_access($1,'PROMOTIONAL',jsonb_build_array('full_mock'),now()-interval '2 hours',now()-interval '1 hour','Expired promo fixture')",
      [rejectedRequester],
    );
    expect((await as(rejectedRequester, "select has_entitlement('full_mock') allowed")).rows[0]).toEqual({
      allowed: false,
    });

    await as(superAdmin, "select set_user_access($1,'STUDENT','PREMIUM',now()+interval '1 hour')", [
      rejectedRequester,
    ]);
    expect((await as(rejectedRequester, "select has_entitlement('full_mock') allowed")).rows[0]).toEqual({
      allowed: true,
    });
    const legacyDeny = (
      await as(
        superAdmin,
        "select set_feature_override($1,'full_mock',false,now(),null,'Legacy deny fixture') id",
        [rejectedRequester],
      )
    ).rows[0]!.id;
    expect((await as(rejectedRequester, "select has_entitlement('full_mock') allowed")).rows[0]).toEqual({
      allowed: false,
    });
    await as(superAdmin, "select revoke_feature_override($1)", [legacyDeny]);
    expect((await as(rejectedRequester, "select has_entitlement('full_mock') allowed")).rows[0]).toEqual({
      allowed: true,
    });

    expect(
      (
        await as(
          superAdmin,
          "select count(*)::int n from audit_events where action in ('ENTITLEMENT_OVERRIDE_SET','ENTITLEMENT_OVERRIDE_REVOKED','ENTITLEMENT_GRANT_CREATED')",
        )
      ).rows[0]?.n,
    ).toBeGreaterThanOrEqual(6);
    expect(allow).toBeTruthy();
  });
  it("uses target difficulty for adaptive selection, then prefers unseen questions", async () => {
    const payload = {
      question_text: "TEST FIXTURE: advanced target challenge.",
      option_a: "Alpha",
      option_b: "Beta",
      option_c: "Gamma",
      option_d: "Delta",
      correct_answer: "A",
      explanation: "Alpha is correct for this controlled challenge.",
      option_explanations: { A: "Correct.", B: "Incorrect.", C: "Incorrect.", D: "Incorrect." },
      subject_id: subject,
      unit_id: unit,
      topic_id: null,
      exam_program_id: program,
      difficulty: "HARD",
      cognitive_level: "APPLICATION",
      source_type: "MANUAL",
      source_year: null,
      source_document: null,
      source_url: null,
      source_page: null,
      source_question_number: null,
      provenance: { fixture: true },
    };
    const hard = (
      await as(admin, "select save_question(null,$1::jsonb) id", [JSON.stringify(payload)])
    ).rows[0]!.id;
    for (const action of ["REVIEW", "VERIFY", "PUBLISH"])
      await as(admin, "select transition_question($1,$2)", [hard, action]);
    await as(a, "select complete_student_onboarding($1,180,array[]::uuid[])", [program]);
    await as(b, "select complete_student_onboarding($1,100,array[]::uuid[])", [program]);
    const first = (
      await as(
        a,
        "select start_attempt($1,'ADAPTIVE',1,null,null,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') id",
        [program],
      )
    ).rows[0]!.id;
    expect(
      (await as(a, "select question_id from attempt_questions where attempt_id=$1", [first]))
        .rows[0]?.question_id,
    ).toBe(hard);
    await as(a, "select complete_attempt($1)", [first]);
    const low = (
      await as(
        b,
        "select start_attempt($1,'ADAPTIVE',1,null,null,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') id",
        [program],
      )
    ).rows[0]!.id;
    expect(
      (
        await as(
          b,
          "select snapshot->>'difficulty' difficulty from attempt_questions where attempt_id=$1",
          [low],
        )
      ).rows[0]?.difficulty,
    ).toBe("EASY");
    await as(b, "select complete_attempt($1)", [low]);
    const second = (
      await as(
        a,
        "select start_attempt($1,'ADAPTIVE',1,null,null,'cccccccc-cccc-4ccc-8ccc-cccccccccccc') id",
        [program],
      )
    ).rows[0]!.id;
    expect(
      (await as(a, "select question_id from attempt_questions where attempt_id=$1", [second]))
        .rows[0]?.question_id,
    ).not.toBe(hard);
    await as(a, "select complete_attempt($1)", [second]);
  });
  it("requires Premium for premium learning modes", async () => {
    await expect(as(a, "select start_learning_game('DAILY_CHALLENGE',1)")).rejects.toThrow(
      /Premium/,
    );
    await as(superAdmin, "select set_user_access($1,'STUDENT','PREMIUM',null)", [a]);
    const session = (await as(a, "select start_learning_game('DAILY_CHALLENGE',1) data")).rows[0]!
      .data as { items: unknown[] };
    expect(session.items).toHaveLength(1);
    await expect(as(a, "select start_learning_game('DAILY_CHALLENGE',1)")).rejects.toThrow(
      /already exists/,
    );
    const speed = (await as(a, "select start_learning_game('SPEED_CHALLENGE',1) data")).rows[0]!
      .data as { mode: string };
    const memory = (await as(a, "select start_learning_game('MEMORY_MATCH',1) data")).rows[0]!
      .data as { mode: string };
    expect(speed.mode).toBe("SPEED_CHALLENGE");
    expect(memory.mode).toBe("MEMORY_MATCH");
  });
  it("versions plan edits and activates manual payments exactly once", async () => {
    const plan = (await as(admin, "select id from subscription_plans where code='CEE_PRACTICE'"))
      .rows[0]!.id;
    const original = (
      await as(admin, "select to_jsonb(p) data from subscription_plans p where id=$1", [plan])
    ).rows[0]!.data as Record<string, unknown>;
    const edited = {
      ...original,
      name: "CEE Practice",
      price_npr: 499,
      duration_days: 30,
      ai_daily_limit: 10,
      display_order: 20,
      recommended: false,
      enabled: true,
    };
    await as(admin, "select save_subscription_plan($1,$2::jsonb)", [plan, JSON.stringify(edited)]);
    expect(
      (
        await as(admin, "select count(*)::int n from subscription_plan_versions where plan_id=$1", [
          plan,
        ])
      ).rows[0]?.n,
    ).toBe(1);
    const method = (await as(admin, "select id from payment_methods where code='ESEWA'")).rows[0]!
      .id;
    const methodData = {
      name: "eSewa",
      enabled: true,
      qr_object_path: null,
      display_name: "MyQuiz",
      instructions: "Use the owner-provided QR.",
      account_identifier: "TEST-OWNER-ID",
      verification_instructions: "Match the reference ID.",
      display_order: 10,
    };
    await as(admin, "select save_payment_method($1,$2::jsonb)", [
      method,
      JSON.stringify(methodData),
    ]);
    await as(
      b,
      "insert into storage.objects(bucket_id,name) values('payment-receipts',$1)",
      [`${b}/00000000-0000-4000-8000-000000000001.png`],
    );
    const payment = (
      await as(b, "select (submit_payment_request($1,$2,'TEST-REFERENCE-1',null,$3)).id id", [
        plan,
        method,
        `${b}/00000000-0000-4000-8000-000000000001.png`,
      ])
    ).rows[0]!.id;
    await as(admin, "select review_payment_request($1,'APPROVE','Reference verified')", [payment]);
    expect((await as(b, "select has_entitlement('custom_tests') allowed")).rows[0]).toEqual({
      allowed: true,
    });
    expect(
      (await as(b, "select tier,active_subscription_id is not null active from entitlements"))
        .rows[0],
    ).toEqual({ tier: "PREMIUM", active: true });
    await expect(
      as(admin, "select review_payment_request($1,'APPROVE',null)", [payment]),
    ).rejects.toThrow(/finalized/i);
  });
  it("requires an owned receipt, preserves the server price, and never upgrades rejected payments", async () => {
    const plan = (await as(admin, "select id,price_npr from subscription_plans where code='CEE_PRO'"))
      .rows[0]!;
    const method = (await as(admin, "select id from payment_methods where code='ESEWA'")).rows[0]!
      .id;
    const ownerReceipt = `${a}/00000000-0000-4000-8000-000000000002.pdf`;
    const otherReceipt = `${b}/00000000-0000-4000-8000-000000000003.pdf`;
    const disposableReceipt = `${a}/00000000-0000-4000-8000-000000000005.pdf`;
    await as(a, "insert into storage.objects(bucket_id,name) values('payment-receipts',$1)", [ownerReceipt]);
    await as(b, "insert into storage.objects(bucket_id,name) values('payment-receipts',$1)", [otherReceipt]);
    await as(a, "insert into storage.objects(bucket_id,name) values('payment-receipts',$1)", [disposableReceipt]);
    expect((await as(a, "delete from storage.objects where bucket_id='payment-receipts' and name=$1 returning name", [disposableReceipt])).rows).toEqual([{ name: disposableReceipt }]);
    await expect(
      as(a, "select submit_payment_request($1,$2,'OWNED-RECEIPT-TEST',null,$3)", [plan.id, method, otherReceipt]),
    ).rejects.toThrow(/valid payment receipt|required/i);
    await expect(
      as(a, "select submit_payment_request($1,$2,'MISSING-RECEIPT-TEST',null,$3)", [plan.id, method, `${a}/00000000-0000-4000-8000-000000000004.pdf`]),
    ).rejects.toThrow(/receipt is unavailable/i);
    const payment = (
      await as(a, "select (submit_payment_request($1,$2,'OWNED-RECEIPT-TEST',null,$3)).id id", [plan.id, method, ownerReceipt])
    ).rows[0]!.id;
    expect((await as(a, "select amount_npr::float,receipt_object_path from payment_requests where id=$1", [payment])).rows[0]).toEqual({
      amount_npr: Number(plan.price_npr), receipt_object_path: ownerReceipt,
    });
    await expect(
      as(a, "select submit_payment_request($1,$2,'OWNED-RECEIPT-TEST',null,$3)", [plan.id, method, ownerReceipt]),
    ).rejects.toThrow();
    await as(admin, "select review_payment_request($1,'REJECT','Receipt does not match account history')", [payment]);
    expect((await as(a, "select status from payment_requests where id=$1", [payment])).rows[0]).toEqual({ status: "REJECTED" });
    expect((await as(a, "delete from storage.objects where bucket_id='payment-receipts' and name=$1 returning name", [ownerReceipt])).rows).toEqual([]);
    expect((await as(b, "delete from storage.objects where bucket_id='payment-receipts' and name=$1 returning name", [ownerReceipt])).rows).toEqual([]);
    expect((await as(admin, "select name from storage.objects where bucket_id='payment-receipts' and name=$1", [ownerReceipt])).rows).toEqual([{ name: ownerReceipt }]);
    expect((await as(a, "select count(*)::int n from subscriptions where user_id=auth.uid() and source='MANUAL_PAYMENT'")).rows[0]?.n).toBe(0);
    await expect(as(a, "select review_payment_request($1,'APPROVE','forged')", [payment])).rejects.toThrow(/Admin access/i);
  });
  it("allows failed-upload cleanup but makes attached payment receipts immutable", async () => {
    const plan = (await as(admin, "select id from subscription_plans where code='CEE_PRACTICE'")).rows[0]!
      .id;
    const method = (await as(admin, "select id from payment_methods where code='ESEWA'")).rows[0]!
      .id;
    const disposable = `${a}/00000000-0000-4000-8000-000000000006.png`;
    const attached = `${a}/00000000-0000-4000-8000-000000000007.png`;
    await as(a, "insert into storage.objects(bucket_id,name) values('payment-receipts',$1)", [disposable]);
    expect((await as(a, "delete from storage.objects where bucket_id='payment-receipts' and name=$1 returning name", [disposable])).rows).toEqual([{ name: disposable }]);
    await as(a, "insert into storage.objects(bucket_id,name) values('payment-receipts',$1)", [attached]);
    await as(a, "select submit_payment_request($1,$2,'IMMUTABLE-RECEIPT-TEST',null,$3)", [plan, method, attached]);
    expect((await as(a, "delete from storage.objects where bucket_id='payment-receipts' and name=$1 returning name", [attached])).rows).toEqual([]);
    expect((await as(admin, "select name from storage.objects where bucket_id='payment-receipts' and name=$1", [attached])).rows).toEqual([{ name: attached }]);
  });
  it("does not let students see any canonical answer rows", async () =>
    expect((await as(a, "select * from questions")).rows).toHaveLength(0));
  it("requires review and verification before publication", async () => {
    await expect(
      as(admin, "select transition_question($1,'PUBLISH')", [question]),
    ).rejects.toThrow();
    await as(admin, "select transition_question($1,'REVIEW')", [question]);
    await as(admin, "select transition_question($1,'VERIFY')", [question]);
    await as(admin, "select transition_question($1,'PUBLISH')", [question]);
  });
  it("persists learning games separately and hides answer keys from table access", async () => {
    const session = (await as(a, "select start_learning_game('ACCURACY',1) data")).rows[0]!
      .data as { id: string; items: Array<{ question_id: string }> };
    expect(session.items).toHaveLength(1);
    await expect(as(a, "select * from learning_game_items")).rejects.toThrow();
    const result = (
      await as(a, "select answer_learning_game($1,$2,'A',null,1200) data", [
        session.id,
        session.items[0]!.question_id,
      ])
    ).rows[0]!.data as { correct: boolean; completed: boolean };
    expect(result).toMatchObject({ correct: true, completed: true });
    expect(
      (
        await as(a, "select status,correct_count from learning_game_sessions where id=$1", [
          session.id,
        ])
      ).rows[0],
    ).toEqual({ status: "COMPLETED", correct_count: 1 });
    expect(
      (
        await as(a, "select count(*)::int n from xp_events where event_key=$1", [
          `game:${session.id}`,
        ])
      ).rows[0],
    ).toEqual({ n: 1 });
  });
  it("creates an owned daily plan and blocks cross-user updates", async () => {
    const plan = (await as(a, "select get_today_plan() data")).rows[0]!.data as Array<{
      id: string;
    }>;
    expect(plan).toHaveLength(4);
    await as(a, "select set_study_plan_item($1,true)", [plan[0]!.id]);
    expect(
      (await as(a, "select completed from study_plan_items where id=$1", [plan[0]!.id])).rows[0]
        ?.completed,
    ).toBe(true);
    await expect(as(b, "select set_study_plan_item($1,true)", [plan[0]!.id])).rejects.toThrow(
      /not found/i,
    );
    expect((await as(b, "select * from study_plan_items where user_id=$1", [a])).rows).toHaveLength(
      0,
    );
  });
  it("lets staff update only admin profile preferences through the dedicated RPC", async () => {
    await as(admin, "select update_admin_profile('Admin Person','UTC')");
    expect(
      (await as(admin, "select display_name,timezone,role from profiles where id=auth.uid()"))
        .rows[0],
    ).toEqual({ display_name: "Admin Person", timezone: "UTC", role: "ADMIN" });
    await expect(as(a, "select update_admin_profile('Student','UTC')")).rejects.toThrow();
  });
  it("fails a full test honestly when the blueprint cannot be filled", async () =>
    await expect(
      as(a, "select start_attempt($1,'FULL',200,null,null,gen_random_uuid())", [program]),
    ).rejects.toThrow(/Not enough/));
  it("persists server selection and retries idempotently", async () => {
    const key = "44444444-4444-4444-8444-444444444444";
    attempt = (
      await as(a, "select start_attempt($1,'SUBJECT',1,$2,null,$3) id", [program, subject, key])
    ).rows[0]!.id as string;
    expect(
      (await as(a, "select start_attempt($1,'SUBJECT',1,$2,null,$3) id", [program, subject, key]))
        .rows[0]!.id,
    ).toBe(attempt);
    const selected = (
      await as(a, "select question_id from attempt_questions where attempt_id=$1", [attempt])
    ).rows;
    expect(selected).toHaveLength(1);
    attemptQuestion = selected[0]!.question_id as string;
    attemptExplanation = (
      await db.query<{ explanation: string }>("select explanation from questions where id=$1", [
        attemptQuestion,
      ])
    ).rows[0]!.explanation;
  });
  it("does not expose the answer key or explanations during an active test", async () => {
    const detail = (await as(a, "select get_attempt($1) detail", [attempt])).rows[0]!.detail;
    expect(JSON.stringify(detail)).not.toContain("correct_answer");
    expect(JSON.stringify(detail)).not.toContain(attemptExplanation);
    await expect(as(a, "select * from attempt_question_keys")).rejects.toThrow();
  });
  it("rejects Student B access to Student A attempt, answer or completion", async () => {
    expect((await as(b, "select * from attempts where id=$1", [attempt])).rows).toHaveLength(0);
    expect(
      (await as(b, "select * from attempt_questions where attempt_id=$1", [attempt])).rows,
    ).toHaveLength(0);
    await expect(as(b, "select get_attempt($1)", [attempt])).rejects.toThrow();
    await expect(
      as(b, "select save_answer($1,$2,'A',false,0)", [attempt, question]),
    ).rejects.toThrow();
    await expect(as(b, "select complete_attempt($1)", [attempt])).rejects.toThrow();
  });
  it("blocks direct scoring and answer tampering", async () => {
    await expect(as(a, "update attempts set score=200 where id=$1", [attempt])).rejects.toThrow();
    await expect(
      as(a, "update attempt_questions set selected_answer='A' where attempt_id=$1", [attempt]),
    ).rejects.toThrow();
  });
  it("persists an answer and detects stale answer revisions", async () => {
    await as(a, "select save_answer($1,$2,'B',true,0)", [attempt, attemptQuestion]);
    expect(
      (
        await as(
          a,
          "select selected_answer,marked_for_review,revision from attempt_questions where attempt_id=$1",
          [attempt],
        )
      ).rows[0],
    ).toEqual({ selected_answer: "B", marked_for_review: true, revision: 1 });
    await expect(
      as(a, "select save_answer($1,$2,'A',false,0)", [attempt, attemptQuestion]),
    ).rejects.toThrow(/refresh/);
  });
  it("scores using immutable snapshots even if the original is archived", async () => {
    await as(admin, "select transition_question($1,'ARCHIVE')", [attemptQuestion]);
    await as(a, "select complete_attempt($1)", [attempt]);
    expect(
      (
        await as(a, "select score::float,incorrect_count,status from attempts where id=$1", [
          attempt,
        ])
      ).rows[0],
    ).toEqual({ score: -0.25, incorrect_count: 1, status: "COMPLETED" });
    const r = await as(a, "select get_attempt($1) detail", [attempt]);
    expect(JSON.stringify(r)).toContain(attemptExplanation);
  });
  it("completion is idempotent and forbids later answers", async () => {
    await as(a, "select complete_attempt($1)", [attempt]);
    await expect(
      as(a, "select save_answer($1,$2,'A',false,1)", [attempt, attemptQuestion]),
    ).rejects.toThrow(/ended/);
  });
  it("persists bookmarks across identity changes and isolates ownership", async () => {
    await as(a, "select set_bookmark($1,true)", [attemptQuestion]);
    expect((await as(b, "select * from bookmarks")).rows).toHaveLength(0);
    expect((await as(a, "select * from bookmarks")).rows).toHaveLength(1);
    expect(JSON.stringify(await as(a, "select get_bookmarks()"))).toContain(attemptQuestion);
  });
  it("accepts contribution metadata idempotently and enforces trusted object paths", async () => {
    const request = "55555555-5555-4555-8555-555555555555";
    const first = (
      await as(
        a,
        "select (create_contribution('paper.pdf','application/pdf',1024,'PAST_PAPER',$1)).*",
        [request],
      )
    ).rows[0]!;
    const second = (
      await as(
        a,
        "select (create_contribution('paper.pdf','application/pdf',1024,'PAST_PAPER',$1)).*",
        [request],
      )
    ).rows[0]!;
    expect(second.id).toBe(first.id);
    await expect(
      as(b, "insert into storage.objects(bucket_id,name,owner_id) values('contributions',$1,$2)", [
        first.object_path,
        b,
      ]),
    ).rejects.toThrow();
  });
  it("isolates contribution rows between students", async () => {
    expect(
      (await as(b, "select * from contributions where uploader_id=$1", [a])).rows,
    ).toHaveLength(0);
    expect((await as(a, "select * from contributions")).rows).toHaveLength(1);
  });
  it("enforces explicit, auditable contribution review transitions", async () => {
    const id = (
      await db.query<{ id: string }>("select id from contributions where uploader_id=$1 limit 1", [
        a,
      ])
    ).rows[0]!.id;
    expect(
      (await as(admin, "select review_contribution($1,'APPROVE') state", [id])).rows[0],
    ).toEqual({ state: "APPROVED" });
    await expect(as(admin, "select review_contribution($1,'REJECT')", [id])).rejects.toThrow(
      /reopen/i,
    );
    expect(
      (await as(admin, "select review_contribution($1,'REOPEN') state", [id])).rows[0],
    ).toEqual({ state: "PENDING_REVIEW" });
    expect(
      (await as(admin, "select review_contribution($1,'NEEDS_REVISION') state", [id])).rows[0],
    ).toEqual({ state: "NEEDS_REVISION" });
  });
  it("restricts source management to administrators", async () => {
    const source = {
      platform: "META",
      source_type: "PAGE",
      source_identifier: "official-page",
      canonical_url: "https://facebook.com/official-page",
      label: "Official page",
      enabled: false,
      authorization_state: "UNVERIFIED",
    };
    await expect(
      as(a, "select save_external_source(null,$1::jsonb)", [JSON.stringify(source)]),
    ).rejects.toThrow();
    const id = (
      await as(admin, "select save_external_source(null,$1::jsonb) id", [JSON.stringify(source)])
    ).rows[0]!.id;
    await expect(as(admin, "select queue_ingestion($1)", [id])).rejects.toThrow(/authorized/);
  });
  it("keeps external source tables hidden from students", async () =>
    expect((await as(a, "select * from external_sources")).rows).toHaveLength(0));
});
