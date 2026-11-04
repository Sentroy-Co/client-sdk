//! Wire-compatible platform request and response models.
pub mod mail;
pub mod storage;
pub mod whatsapp;
pub use mail::*;
pub use storage::*;
pub use whatsapp::*;
