export function caregiverSentMessage(caregiverName: string, emailed: boolean): string {
  if (emailed) return `This one needs ${caregiverName}'s OK. I've sent it to ${caregiverName}. I'll tell you as soon as there's an answer.`;
  // Never tell Rose an email went out when it didn't.
  return `This one needs ${caregiverName}'s OK. ${caregiverName} will see it on the CareCart page. I'll tell you as soon as there's an answer.`;
}
