//! ADR 0006: the app makes no network calls. The only thing it ever hands to the
//! browser is the GitHub Releases page, so `open_url` refuses everything else.

pub const RELEASES_URL: &str = "https://github.com/Hunter-Andrew/screenshot-annotation/releases";

pub fn is_allowed(url: &str) -> bool {
    url == RELEASES_URL
        || url
            .strip_prefix(RELEASES_URL)
            .is_some_and(|rest| rest.starts_with('/'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_the_releases_page_and_its_subpages() {
        assert!(is_allowed(RELEASES_URL));
        assert!(is_allowed("https://github.com/Hunter-Andrew/screenshot-annotation/releases/tag/v0.1.0"));
    }

    #[test]
    fn refuses_everything_else() {
        assert!(!is_allowed("https://example.com"));
        assert!(!is_allowed("http://github.com/Hunter-Andrew/screenshot-annotation/releases"));
        assert!(!is_allowed("https://github.com/Hunter-Andrew/screenshot-annotation/releases.evil.com"));
        assert!(!is_allowed("https://github.com/Hunter-Andrew/screenshot-annotation/releases@evil.com"));
        assert!(!is_allowed("file:///C:/Windows/System32/calc.exe"));
        assert!(!is_allowed(""));
    }
}
