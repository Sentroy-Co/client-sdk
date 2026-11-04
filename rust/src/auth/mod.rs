//! Portable identity authentication. Applications own secure session storage,
//! navigation, callbacks and WebAuthn platform interactions.
mod client;
mod admin;
mod types;
pub use admin::SentroyAuthAdmin;
pub use client::SentroyAuth;
pub use types::*;
