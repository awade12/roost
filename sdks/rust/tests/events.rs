#![allow(clippy::unwrap_used)]
mod common;

use common::{Fake, config};
use roost_sdk::{Roost, RoostError, TrackEvent};

#[test]
fn sends_events_with_device_context() {
    let fake = Fake::new();
    let roost = Roost::start(config(&fake).locale("en-GB")).unwrap();
    roost.track_event(
        TrackEvent::new("level_complete")
            .prop("level", 3)
            .value(42.0),
    );
    assert!(roost.flush());

    assert_eq!(fake.event_names(), ["session_start", "level_complete"]);
    let body = &fake.bodies("/v1/events")[0];
    assert_eq!(body["context"]["build"], "1.0.0");
    assert_eq!(body["context"]["locale"], "en-GB");
    assert!(
        body["context"]["sdk"]
            .as_str()
            .unwrap()
            .starts_with("rust/")
    );
    let all: Vec<serde_json::Value> = fake
        .bodies("/v1/events")
        .iter()
        .flat_map(|b| b["events"].as_array().cloned().unwrap())
        .collect();
    let event = all.iter().find(|e| e["name"] == "level_complete").unwrap();
    assert_eq!(event["props"]["level"], 3);
    assert_eq!(event["value"], 42.0);
    assert_eq!(event["playerId"], "player-1");
    assert_eq!(event["sessionId"], roost.session_id());
}

#[test]
fn drops_invalid_names_instead_of_poisoning_the_batch() {
    let fake = Fake::new();
    let roost = Roost::start(config(&fake)).unwrap();
    roost.track("Level Complete");
    roost.track("ok_event");
    roost.flush();
    assert_eq!(fake.event_names(), ["session_start", "ok_event"]);
}

#[test]
fn keeps_events_while_the_server_is_down() {
    let fake = Fake::new();
    // Down before start: `start` flushes `session_start` straight away, and that flush must not get through.
    fake.set_status(503);
    let roost = Roost::start(config(&fake)).unwrap();
    roost.track("first");
    roost.flush();
    fake.posts.lock().unwrap().clear();

    fake.set_status(202);
    roost.flush();
    assert_eq!(fake.event_names(), ["session_start", "first"]);
}

#[test]
fn drops_a_batch_the_server_rejects() {
    let fake = Fake::new();
    let roost = Roost::start(config(&fake)).unwrap();
    fake.set_status(400);
    roost.flush();
    fake.set_status(202);
    fake.posts.lock().unwrap().clear();
    roost.track("after");
    roost.flush();
    assert_eq!(fake.event_names(), ["after"]);
}

#[test]
fn shutdown_sends_session_end() {
    let fake = Fake::new();
    let roost = Roost::start(config(&fake)).unwrap();
    roost.shutdown();
    assert_eq!(fake.event_names(), ["session_start", "session_end"]);
}

#[test]
fn rejects_bad_config() {
    let fake = Fake::new();
    let no_scheme = roost_sdk::Config::new("roost.test", "k", "p", "1").transport(fake.clone());
    assert!(matches!(
        Roost::start(no_scheme).err(),
        Some(RoostError::Config(_))
    ));
    let long_player = roost_sdk::Config::new("http://x", "k", "p".repeat(65), "1").transport(fake);
    assert!(matches!(
        Roost::start(long_player).err(),
        Some(RoostError::Config(_))
    ));
}

#[test]
fn ai_returns_text_or_the_api_error() {
    let fake = Fake::new();
    let roost = Roost::start(config(&fake)).unwrap();
    *fake.ai_body.lock().unwrap() =
        r#"{"text":"Hi!","model":"m","usage":{"tokensIn":3,"tokensOut":2}}"#.to_owned();
    fake.set_status(200);
    let res = roost
        .ai("greet", serde_json::json!({ "name": "Ada" }))
        .unwrap();
    assert_eq!(res.text, "Hi!");
    assert_eq!(res.usage.tokens_out, 2);
    let sent = &fake.bodies("/v1/ai/run")[0];
    assert_eq!(sent["vars"]["name"], "Ada");
    assert_eq!(sent["playerId"], "player-1");

    *fake.ai_body.lock().unwrap() =
        r#"{"error":{"code":"rate_limited","message":"Budget used"}}"#.to_owned();
    fake.set_status(429);
    let err = roost.ai("greet", ()).unwrap_err();
    assert!(matches!(err, RoostError::Api { status: 429, ref code, .. } if code == "rate_limited"));
}

#[test]
fn player_reports_carry_scope_and_files_and_skip_a_missing_email() {
    let fake = Fake::new();
    let cfg = config(&fake).attachments(|| vec![roost_sdk::Attachment::new("save.json", "{}")]);
    let roost = Roost::start(cfg).unwrap();
    roost.set_tag("level", "forest-3");
    fake.set_status(202);
    let id = roost
        .report(
            roost_sdk::PlayerReport::new("  Can't jump  ")
                .attachment(roost_sdk::Attachment::new("screenshot.png", vec![1, 2])),
        )
        .unwrap();
    let body = &fake.bodies("/v1/reports")[0]["report"];
    assert_eq!(body["id"], id.as_str());
    assert_eq!(body["message"], "Can't jump");
    assert_eq!(body["category"], "bug");
    assert_eq!(body["tags"]["level"], "forest-3");
    assert!(body.get("email").is_none());
    let names: Vec<String> = fake
        .puts
        .lock()
        .unwrap()
        .iter()
        .map(|p| p.filename.clone())
        .collect();
    assert_eq!(names, ["screenshot.png", "save.json"]);

    fake.set_status(400);
    assert!(matches!(
        roost.report(roost_sdk::PlayerReport::new("x").email("a@b.co")),
        Err(RoostError::Api { status: 400, .. })
    ));
}
