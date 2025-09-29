## Our NFT Smart Contracts – Project Registry

Keep this file updated as on-chain objects change.

### Network
- **Network**: mainnet
- **Default gas budget**: 10000000 (adjust as needed)

### Package and Types
- **Package (collection)**: `0xbd672d1c158c963ade8549ae83bda75f29f6b3ce0c59480f3921407c4e8c6781`
- **Module**: `suilfg::governance_nfts`
- **NFT Type**: `0xbd672d1c158c963ade8549ae83bda75f29f6b3ce0c59480f3921407c4e8c6781::governance_nfts::SuiLFG_NFT`
- **Royalty Rule package**: `0xdfb4f1d4e43e0c3ad834dcd369f0d39005c872e118c9dc1c5da9765bb93ee5f3`

### Core Objects
- **AdminCap**: `0xe1e2131617eb3523fd2bd67ffaa8281bd263304a5a2012e5cdf9295377126066`
- **MintingControl**: `0x4c097147e9c1d2d59bd0f7ae42c8bf906c6fae8b939e47d30189c580b05ba9e7`
- **TransferPolicy<SuiLFG_NFT>**: `0x19697e068f28eda3b7db19dc5430bac452312912e605f50663c58a78962ef26e`
- **TransferPolicyCap**: `0xaeb079c6a7e3adace7692c67c49094b0dcea60bb41f01df9064dd69551a4cf2f`
- **Your Kiosk**: `<TBD>`
- **Your KioskOwnerCap**: `<TBD>`
- **Friend’s Kiosk (example)**: `0x397b95fad074cf366db8a987a6d7a1a1cd61ee0f493b690cb42c0503ebb0edc9`

### Collection Metadata (from main contract)
- **Collection name**: SuiLFG Governance NFTs
- **Description**: A multi-tiered governance NFT collection.
- **Project URL**: `https://www.suilfg.com`
- **Twitter**: `https://x.com/SuiLFG_`
- **Collection image**: `https://nft.suilfg.com/images/Council.png`
- **Display fields**: `name`, `image_url`, `description`, `url`
- **URL template**: `https://nft.suilfg.com/metadata/{id}.json`
- **Attributes (kept under attributes, not Display)**:
  - `Tier`: `Council | Governor | Voter`
  - `Voting Power`: `25x | 5x | 1.5x`

### Supply (from contract)
- **Council**: 100
- **Governor**: 1000
- **Voter**: 10000

### Rules on TransferPolicy
- **kiosk_lock_rule**: Added (TradePort requirement). Verify it appears in rules list.
- **royalty_rule**: Active; sticking with 5% for now
  - Basis points (bps): `500`
  - Denominator: `1_000_000`

### Operational Commands
- Inspect policy object (rules + balance):
```bash
sui client object 0x19697e068f28eda3b7db19dc5430bac452312912e605f50663c58a78962ef26e --json \
| jq '{rules: [.content.fields.rules.fields.contents[].fields.name], balance: .content.fields.balance}'
```

- List dynamic fields (to see rule keys like royalty_rule and kiosk_lock_rule):
```bash
sui client dynamic-fields --object-id 0x19697e068f28eda3b7db19dc5430bac452312912e605f50663c58a78962ef26e --json
```

- Withdraw royalties (to your address):
```bash
sui client call \
  --package 0x2 \
  --module transfer_policy \
  --function withdraw \
  --args 0x19697e068f28eda3b7db19dc5430bac452312912e605f50663c58a78962ef26e \
         0xaeb079c6a7e3adace7692c67c49094b0dcea60bb41f01df9064dd69551a4cf2f \
         <your_address> \
  --type-args 0xbd672d1c158c963ade8549ae83bda75f29f6b3ce0c59480f3921407c4e8c6781::governance_nfts::SuiLFG_NFT \
  --gas-budget 10000000
```

- Add royalty rule (example 5%):
```bash
sui client call \
  --package 0xdfb4f1d4e43e0c3ad834dcd369f0d39005c872e118c9dc1c5da9765bb93ee5f3 \
  --module royalty_rule \
  --function add \
  --args 0x19697e068f28eda3b7db19dc5430bac452312912e605f50663c58a78962ef26e \
         0xaeb079c6a7e3adace7692c67c49094b0dcea60bb41f01df9064dd69551a4cf2f \
         500 \
         1000000 \
  --type-args 0xbd672d1c158c963ade8549ae83bda75f29f6b3ce0c59480f3921407c4e8c6781::governance_nfts::SuiLFG_NFT \
  --gas-budget 10000000
```

- Batch mint to kiosk:
```bash
sui client call \
  --package 0xbd672d1c158c963ade8549ae83bda75f29f6b3ce0c59480f3921407c4e8c6781 \
  --module governance_nfts \
  --function batch_mint_to_kiosk \
  --args 0xe1e2131617eb3523fd2bd67ffaa8281bd263304a5a2012e5cdf9295377126066 \
         0x4c097147e9c1d2d59bd0f7ae42c8bf906c6fae8b939e47d30189c580b05ba9e7 \
         <tier_u8: 0=Council,1=Governor,2=Voter> \
         <start_edition> \
         <count> \
         0x19697e068f28eda3b7db19dc5430bac452312912e605f50663c58a78962ef26e \
         <your_kiosk_id> \
         <your_kiosk_owner_cap_id> \
  --gas-budget 10000000
```

- Mint one to wallet:
```bash
sui client call \
  --package 0xbd672d1c158c963ade8549ae83bda75f29f6b3ce0c59480f3921407c4e8c6781 \
  --module governance_nfts \
  --function mint_one_to_wallet \
  --args 0xe1e2131617eb3523fd2bd67ffaa8281bd263304a5a2012e5cdf9295377126066 \
         0x4c097147e9c1d2d59bd0f7ae42c8bf906c6fae8b939e47d30189c580b05ba9e7 \
         <tier_u8> \
         <edition> \
         <recipient_address> \
  --gas-budget 10000000
```

### Important Notes
- You cannot use someone else’s `KioskOwnerCap`; the signer must be the cap owner.
- If CLI complains about address serialization on `withdraw`, use a PTB (Programmable Transaction Block).
- Only `name`, `image_url`, `description`, `url` belong in `Display`. All other metadata goes into `attributes`.
- Move version should be read from `Move.toml` and NFT metadata should live in external JSON files (do not duplicate in-contract).

### To-Verify Checklist
- Fill in: your kiosk ids and the address you withdraw royalties to.
- Confirm rules on policy via commands above after any upgrade or migration.
