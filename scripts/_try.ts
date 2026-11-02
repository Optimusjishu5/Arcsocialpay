import { createPublicClient, http, type PublicClient } from 'viem'
import { scanRange, recordsFromReceipt, markFastClient, FAST_RPC_URL, SYSTEM_EMITTER, TRANSFER_TOPIC } from '../src/lib/onchainActivity'
import { UNI_TOKENS } from '../src/lib/uniswapArc'
const fast = createPublicClient({ transport: http(FAST_RPC_URL) }) as PublicClient
const main = createPublicClient({ transport: http('https://rpc.mainnet.arc.io') }) as PublicClient
markFastClient(fast)
const head = await main.getBlockNumber()
const logs = await fast.request({ method: 'eth_getLogs', params: [{ fromBlock: '0x' + (head - 300n).toString(16), toBlock: 'latest', address: SYSTEM_EMITTER, topics: [TRANSFER_TOPIC] }] } as never) as { topics: string[]; transactionHash: string }[]
const l = logs.find((x) => x.topics.length >= 3)!
const me = '0x' + l.topics[2].slice(-40)
console.log('wallet', me, 'tx', l.transactionHash)
let t = Date.now()
const r = await scanRange(main, me, UNI_TOKENS, null, head - 345_600n + 1n, head, 5042, undefined, (b) => console.log('batch', b.length, 'after', Date.now() - t, 'ms'), fast, head)
console.log('scan 2 days:', r.records.length, 'records, scannedLow', r.scannedLow, (Date.now() - t) + 'ms')
t = Date.now()
const rec = await recordsFromReceipt(main, fast, me, l.transactionHash, UNI_TOKENS, null, 5042)
console.log('receipt ingest', JSON.stringify(rec), (Date.now() - t) + 'ms')
