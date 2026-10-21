export type Notice = {
  tone: "success" | "warning" | "danger" | "neutral";
  text: string;
};
export type Notify = (notice: Notice) => void;
