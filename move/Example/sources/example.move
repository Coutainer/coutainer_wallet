module example::example {
    use sui::tx_context::{TxContext};
    use sui::object::{Self};

    public entry fun ping(_ctx: &mut TxContext) {
        // no-op, useful for testing moveCall
    }
}



