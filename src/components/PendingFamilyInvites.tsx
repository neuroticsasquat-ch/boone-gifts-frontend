import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  getIncomingFamilyInvites,
  acceptFamilyInvite,
  declineFamilyInvite,
} from "../api/families";

export function PendingFamilyInvites() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["familyInvites"],
    queryFn: getIncomingFamilyInvites,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["familyInvites"] });
    queryClient.invalidateQueries({ queryKey: ["families"] });
    queryClient.invalidateQueries({ queryKey: ["lists", "family"] });
  };

  const acceptMutation = useMutation({
    mutationFn: acceptFamilyInvite,
    onSuccess: invalidateAll,
    onError: () => toast.error("Failed to accept invite."),
  });

  const declineMutation = useMutation({
    mutationFn: declineFamilyInvite,
    onSuccess: invalidateAll,
    onError: () => toast.error("Failed to decline invite."),
  });

  if (!data || data.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900">Pending Family Invites</h2>
      <ul className="mt-3 divide-y divide-gray-200 rounded-lg bg-white shadow">
        {data.map((invite) => (
          <li key={invite.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-medium text-gray-900">{invite.family.name}</p>
              <p className="text-sm text-gray-500">Invited by {invite.invited_by.name}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => acceptMutation.mutate(invite.token)}
                disabled={acceptMutation.isPending}
                className="rounded bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                Accept
              </button>
              <button
                onClick={() => declineMutation.mutate(invite.token)}
                disabled={declineMutation.isPending}
                className="rounded bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
