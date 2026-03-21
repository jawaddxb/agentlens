'use client'

import { Shield, Lock } from 'lucide-react'

interface AttestationBadgeProps {
  simulationId: number
  hash?: string
}

function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash
  return `${hash.slice(0, 8)}...${hash.slice(-8)}`
}

export default function AttestationBadge({
  simulationId,
  hash,
}: AttestationBadgeProps) {
  const isAttested = !!hash

  return (
    <div
      className={`group inline-flex items-center gap-3 rounded-lg border px-4 py-2.5 transition-all duration-200 ${
        isAttested
          ? 'border-success/40 bg-success/5 hover:border-success/60 hover:bg-success/8'
          : 'border-border bg-surface hover:border-muted/40 hover:bg-surface2'
      }`}
    >
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-md ${
          isAttested ? 'bg-success/15' : 'bg-surface2'
        }`}
      >
        {isAttested ? (
          <Shield className="h-4 w-4 text-success" />
        ) : (
          <Lock className="h-4 w-4 text-muted" />
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-medium ${
              isAttested ? 'text-success' : 'text-muted'
            }`}
          >
            {isAttested ? 'Knowracle Attested' : 'Pending Attestation'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted">
            sim:{simulationId}
          </span>
          {hash && (
            <>
              <span className="text-[10px] text-muted/40">|</span>
              <span className="font-mono text-[10px] text-muted/70">
                {truncateHash(hash)}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
