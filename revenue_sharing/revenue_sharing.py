import beaker as bk
import pyteal as pt

from beaker import Application, GlobalStateValue, localnet, client

# Define the state for the RevenueSharing smart contract
class RevenueSharingState:
    # Global state values for the contract: creator and platform addresses
    creator_address = GlobalStateValue(pt.TealType.bytes, descr="Address of the content creator")
    platform_address = GlobalStateValue(pt.TealType.bytes, descr="Address of the platform")

# Initialize the Beaker application
app = Application("RevenueSharingApp", descr="Smart contract for revenue sharing", state=RevenueSharingState())

# Method to initialize the global state of the contract
@app.create()
def create() -> pt.Expr:
    """Initializes the contract's global state."""
    return pt.Seq(
        app.state.creator_address.set(pt.Txn.sender()),  # Set the creator as the sender
        app.state.platform_address.set(pt.Global.creator_address())  # Set platform as creator's address
    )

#@app.external
def split_revenue(
    payment: pt.abi.PaymentTransaction,  # Incoming payment transaction
    *,
    output: pt.abi.Uint64  # Output variable to store the total payment amount
) -> pt.Expr:
    """Splits the payment between the creator (70%) and platform (30%)."""
    creator_share = pt.Int(70)
    platform_share = pt.Int(30)
    
    return pt.Seq(
        pt.Assert(
            pt.And(
                payment.get().receiver() == pt.Global.current_application_address(),  # Ensure payment is made to the contract
                payment.get().amount() > pt.Int(0)  # Ensure positive payment amount
            )
        ),
        # Distribute funds to the creator (70%)
        pt.InnerTxnBuilder.Begin(),
        pt.InnerTxnBuilder.SetFields({
            pt.TxnField.type_enum: pt.TxnType.Payment,
            pt.TxnField.receiver: app.state.creator_address.get(),
            pt.TxnField.amount: payment.get().amount() * creator_share / pt.Int(100),
        }),
        pt.InnerTxnBuilder.Submit(),
        
        # Distribute funds to the platform (30%)
        pt.InnerTxnBuilder.Begin(),
        pt.InnerTxnBuilder.SetFields({
            pt.TxnField.type_enum: pt.TxnType.Payment,
            pt.TxnField.receiver: app.state.platform_address.get(),
            pt.TxnField.amount: payment.get().amount() * platform_share / pt.Int(100),
        }),
        pt.InnerTxnBuilder.Submit(),
        
        # Return total amount for reference
        output.set(payment.get().amount())
    )

@app.external(read_only=True)
def get_addresses(*, output: pt.abi.Tuple2[pt.abi.Address, pt.abi.Address]) -> pt.Expr:
    """Returns the creator and platform addresses."""
    creator_address = pt.abi.Address()
    platform_address = pt.abi.Address()
    
    return pt.Seq(
        creator_address.set(app.state.creator_address.get()),
        platform_address.set(app.state.platform_address.get()),
        output.set(creator_address, platform_address)
    )


# Build the application specification
if __name__ == "__main__":
    app_spec = app.build()

    # Export the contract files (approval and clear programs)
    app_spec.export("artifacts")
    
    # Optionally print the global state schema in JSON format
    print(app_spec.global_state_schema.dictify())
    print(app_spec.to_json())

    # Deploy and interact with the contract using the localnet
    accts = localnet.get_accounts()
    algod_client = localnet.get_algod_client()

    # Create an application client for the RevenueSharing contract
    app_client = client.ApplicationClient(
        algod_client, app, signer=accts[0].signer
    )

    # Deploy the contract
    app_id, app_addr, txid = app_client.create()
    print(f"Created app with id: {app_id} and address: {app_addr} in tx: {txid}")

    # Example of calling the split_revenue method
    payment = pt.abi.PaymentTransaction(pt.Address("creator_address_here"), pt.Int(1000))  # Payment of 1000 microAlgos
    result = app_client.call("split_revenue", payment=payment)
    print(f"Payment distributed: {result.return_value}")
