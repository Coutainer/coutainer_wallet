import { Router } from "express";
import { z } from "zod";
import { createSuiClient } from "../sui/client";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { TransactionBlock } from "@mysten/sui.js/transactions";

export const moveRouter = Router();
const client = createSuiClient();

const callSchema = z.object({
  mnemonic: z.string().optional(),
  packageId: z.string(),
  module: z.string(),
  function: z.string(),
  typeArguments: z.array(z.string()).optional().default([]),
  arguments: z.array(z.any()).optional().default([]),
});

/**
 * @openapi
 * /move/call:
 *   post:
 *     tags:
 *       - Move
 *     summary: Move 함수 호출
 *     description: Sui Move 스마트 컨트랙트의 entry 함수를 호출합니다
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - packageId
 *               - module
 *               - function
 *             properties:
 *               mnemonic:
 *                 type: string
 *                 description: 서명용 니모닉 (선택사항, 없으면 임시 키 사용)
 *               packageId:
 *                 type: string
 *                 description: Move 패키지 ID
 *                 example: "0x1234567890abcdef..."
 *               module:
 *                 type: string
 *                 description: 모듈명
 *                 example: "coupon"
 *               function:
 *                 type: string
 *                 description: 함수명
 *                 example: "ping"
 *               typeArguments:
 *                 type: array
 *                 items: 
 *                   type: string
 *                 description: 타입 인수
 *                 example: []
 *               arguments:
 *                 type: array
 *                 items: {}
 *                 description: 함수 인수
 *                 example: []
 *     responses:
 *       200:
 *         description: 함수 호출 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 digest:
 *                   type: string
 *                   description: 트랜잭션 해시
 *                 effects:
 *                   type: object
 *                   description: 트랜잭션 효과
 *       400:
 *         description: 잘못된 요청 또는 트랜잭션 실패
 */
moveRouter.post("/call", async (req, res) => {
  try {
    const body = callSchema.parse(req.body);

    const signer = body.mnemonic
      ? Ed25519Keypair.deriveKeypair(body.mnemonic)
      : Ed25519Keypair.generate();

    const tx = new TransactionBlock();
    tx.moveCall({
      target: `${body.packageId}::${body.module}::${body.function}`,
      typeArguments: body.typeArguments,
      arguments: body.arguments.map((arg) => tx.pure(arg as any)),
    });

    const resp = await client.signAndExecuteTransactionBlock({
      signer,
      transactionBlock: tx,
      options: { showEffects: true },
    });
    res.json({ digest: resp.digest, effects: resp.effects });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
