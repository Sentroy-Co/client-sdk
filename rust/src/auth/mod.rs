//! Portable identity authentication. Applications own secure session storage,
//! navigation, callbacks and WebAuthn platform interactions.
mod admin;
mod client;
mod types;
pub use admin::SentroyAuthAdmin;
pub use client::SentroyAuth;
pub use types::*;
