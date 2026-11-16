use super::build::Attachment;
use crate::model::{Breadcrumb, JsonMap};
use std::collections::{BTreeMap, VecDeque};

/// Hard cap from the contract (`MAX_BREADCRUMBS`).
pub(crate) const MAX_BREADCRUMBS: usize = 100;

/// Everything set with `set_tag`, `set_context`… that goes on every later report.
#[derive(Debug, Clone, Default)]
pub(crate) struct Scope {
    pub tags: BTreeMap<String, String>,
    pub contexts: BTreeMap<String, JsonMap>,
    pub extra: JsonMap,
    /// Keyed by file name, so setting `save.json` again replaces the old one.
    pub attachments: BTreeMap<String, Attachment>,
    breadcrumbs: VecDeque<Breadcrumb>,
    max_breadcrumbs: usize,
}

impl Scope {
    pub(crate) fn new(max_breadcrumbs: usize) -> Self {
        Self {
            max_breadcrumbs: max_breadcrumbs.min(MAX_BREADCRUMBS),
            ..Self::default()
        }
    }

    pub(crate) fn add_breadcrumb(&mut self, crumb: Breadcrumb) {
        if self.max_breadcrumbs == 0 {
            return;
        }
        while self.breadcrumbs.len() >= self.max_breadcrumbs {
            self.breadcrumbs.pop_front();
        }
        self.breadcrumbs.push_back(crumb);
    }

    pub(crate) fn breadcrumbs(&self) -> Vec<Breadcrumb> {
        self.breadcrumbs.iter().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_only_the_latest_breadcrumbs() {
        let mut scope = Scope::new(2);
        for name in ["a", "b", "c"] {
            scope.add_breadcrumb(Breadcrumb::new(name));
        }
        let names: Vec<String> = scope.breadcrumbs().into_iter().map(|b| b.name).collect();
        assert_eq!(names, ["b", "c"]);
    }

    #[test]
    fn caps_at_contract_limit() {
        assert_eq!(Scope::new(10_000).max_breadcrumbs, MAX_BREADCRUMBS);
    }
}
