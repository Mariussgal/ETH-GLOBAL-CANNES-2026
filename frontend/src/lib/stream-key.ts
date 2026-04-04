import { encodePacked, keccak256, type Address, type Hex } from "viem";

/**
 * Aligné sur Factory : `keccak256(abi.encodePacked(protocolSlug, emitter))`
 */
export function computeStreamKey(
  protocolSlug: string,
  emitter: Address
): Hex {
  return keccak256(
    encodePacked(["string", "address"], [protocolSlug, emitter])
  );
}
