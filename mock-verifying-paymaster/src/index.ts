import cors from "@fastify/cors";
import Fastify from "fastify";
import { http, createPublicClient, Address, PublicClient } from "viem";
import { createBundlerClient } from "viem/account-abstraction";
import { deployErc20Token } from "./helpers/erc20-utils";
import { getAnvilWalletClient, getChain } from "./helpers/utils";
import { createRpcHandler } from "./relay";
import { deployPaymasters } from "./singletonPaymasters";
import {
	getSingletonPaymaster06Address,
	getSingletonPaymaster07Address,
	getSingletonPaymaster08Address,
} from "./constants";

const verifyDeployed = async (client: PublicClient, addresses: Address[]) => {
	let isDeployed = true;
	for (const address of addresses) {
		const bytecode = await client.getCode({
			address,
		});
		if (!bytecode || bytecode === "0x") {
			console.log(`CONTRACT ${address} NOT DEPLOYED!!!`);
			// process.exit(1);
			isDeployed = false;
		}
	}
	return isDeployed;
};

const main = async () => {
	console.log("Starting mock singleton paymaster...");
	const app = Fastify({});
	const anvilRpc = process.env.ANVIL_RPC as string;
	const altoRpc = process.env.ALTO_RPC as string;
	const chain = await getChain();

	const walletClient = await getAnvilWalletClient({
		anvilRpc,
		addressIndex: 1,
	});
	console.log("Wallet client created: ", walletClient.account.address);

	const publicClient = createPublicClient({
		transport: http(anvilRpc),
		chain,
	});
	const bundler = createBundlerClient({
		chain,
		transport: http(altoRpc),
	});

	const [paymaster06, paymaster07, paymaster08] = [
		getSingletonPaymaster06Address(walletClient.account.address),
		getSingletonPaymaster07Address(walletClient.account.address),
		getSingletonPaymaster08Address(walletClient.account.address),
	];

	const isDeployed = await verifyDeployed(publicClient, [
		paymaster06,
		paymaster07,
		paymaster08,
	]);
	if (isDeployed) {
		console.log("Paymaster addresses: ", {
			paymaster06,
			paymaster07,
			paymaster08,
		});
	} else {
		await deployPaymasters({ walletClient, publicClient });
		await deployErc20Token(walletClient, publicClient);
	}

	app.register(cors, {
		origin: "*",
		methods: ["POST", "GET", "OPTIONS"],
	});

	const rpcHandler = createRpcHandler({
		bundler,
		publicClient,
		paymasterSigner: walletClient,
	});
	app.post("/", {}, rpcHandler);

	app.get("/ping", async (_request, reply) => {
		return reply.code(200).send({ message: "pong" });
	});

	await app.listen({ host: "0.0.0.0", port: 3000 });
};

main();
