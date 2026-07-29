// Release builds must not spawn a console window behind the kiosk.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    map_jigsaw_puzzle_lib::run()
}
