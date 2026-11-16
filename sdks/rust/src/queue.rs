use crate::event::Event;
use std::collections::VecDeque;

/// Hard cap so a long offline period can't grow memory without bound.
pub const MAX_QUEUED: usize = 5000;

/// In-memory event queue. Oldest events are dropped first when full.
#[derive(Debug, Default)]
pub struct Queue {
    events: VecDeque<Event>,
}

impl Queue {
    pub fn push(&mut self, event: Event) {
        if self.events.len() >= MAX_QUEUED {
            self.events.pop_front();
        }
        self.events.push_back(event);
    }

    /// Up to `max` oldest events, without removing them.
    pub fn peek(&self, max: usize) -> Vec<Event> {
        self.events.iter().take(max).cloned().collect()
    }

    /// Remove `count` events after the server accepted them.
    pub fn drop_front(&mut self, count: usize) {
        let n = count.min(self.events.len());
        self.events.drain(..n);
    }

    pub fn len(&self) -> usize {
        self.events.len()
    }

    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn ev(name: &str) -> Event {
        Event {
            id: name.into(),
            name: name.into(),
            ts: String::new(),
            session_id: String::new(),
            player_id: String::new(),
            value: None,
            props: BTreeMap::new(),
        }
    }

    #[test]
    fn drops_oldest_when_full() {
        let mut q = Queue::default();
        for i in 0..=MAX_QUEUED {
            q.push(ev(&i.to_string()));
        }
        assert_eq!(q.len(), MAX_QUEUED);
        assert_eq!(q.peek(1).first().map(|e| e.name.as_str()), Some("1"));
    }

    #[test]
    fn drop_front_never_overruns() {
        let mut q = Queue::default();
        q.push(ev("a"));
        q.drop_front(10);
        assert!(q.is_empty());
    }
}
