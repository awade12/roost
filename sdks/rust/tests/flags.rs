#![allow(clippy::unwrap_used)]
mod common;

use common::{Fake, config, temp_dir};
use roost_sdk::Roost;
use serde::Deserialize;

const CONFIG: &str = r#"{"version":"v7","flags":{
  "new_shop":{"type":"boolean","value":true,"variant":"rollout","reason":"SPLIT"},
  "greeting":{"type":"string","value":"Hi","variant":"default","reason":"STATIC"},
  "spawn_rate":{"type":"number","value":1.5,"variant":"default","reason":"STATIC"},
  "enemy.tuning":{"type":"json","value":{"hp":120,"speed":1.1},"variant":"override","reason":"TARGETING_MATCH"}}}"#;

#[derive(Debug, Deserialize, PartialEq)]
struct Tuning {
    hp: u32,
    speed: f32,
}

#[test]
fn reads_flags_by_type_with_defaults() {
    let fake = Fake::new();
    *fake.config_body.lock().unwrap() = CONFIG.to_owned();
    let roost = Roost::start(config(&fake)).unwrap();
    assert!(roost.refresh_flags());
    assert!(roost.flag_bool("new_shop", false));
    assert_eq!(roost.flag_str("greeting", "Hello"), "Hi");
    assert_eq!(roost.flag_f64("spawn_rate", 1.0), 1.5);
    assert_eq!(
        roost.flag_json(
            "enemy.tuning",
            Tuning {
                hp: 100,
                speed: 1.0
            }
        ),
        Tuning {
            hp: 120,
            speed: 1.1
        }
    );
    // Missing or wrong type falls back to the default.
    assert!(!roost.flag_bool("missing", false));
    assert_eq!(roost.flag_f64("greeting", 2.0), 2.0);
    assert_eq!(
        roost.flag_details("enemy.tuning").unwrap().reason,
        "TARGETING_MATCH"
    );
    let gets = fake.gets.lock().unwrap();
    assert!(gets[0].0.starts_with("/v1/config?playerId=player-1"));
}

#[test]
fn revalidates_and_keeps_values_on_disk_between_launches() {
    let dir = temp_dir("flags");
    let fake = Fake::new();
    *fake.config_body.lock().unwrap() = CONFIG.to_owned();
    {
        let roost = Roost::start(config(&fake).data_dir(&dir)).unwrap();
        roost.refresh_flags();
        fake.config_body.lock().unwrap().clear();
        assert!(!roost.refresh_flags());
        assert_eq!(
            fake.gets.lock().unwrap().last().unwrap().1.as_deref(),
            Some("\"v7\"")
        );
    }
    let offline = Fake::new();
    offline.set_offline(true);
    let roost = Roost::start(config(&offline).data_dir(&dir)).unwrap();
    assert!(roost.flag_bool("new_shop", false));
    let _ = std::fs::remove_dir_all(dir);
}
