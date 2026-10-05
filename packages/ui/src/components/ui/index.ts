// shadcn/ui 组件集的桶导出。消费方：import { Button, Card, Input, Label, Select } from "@tsz/ui/components"。
// 与 @tsz/ui 根导出（旧手写 Button/Card，web 在用）互不影响。
export { Button, buttonVariants, type ButtonProps } from "./button";
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent
} from "./card";
export { Input } from "./input";
export { Label } from "./label";
export { FormField, type FormFieldProps } from "./form-field";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from "./dropdown-menu";
export {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "./select";
