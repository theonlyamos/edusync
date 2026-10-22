'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Loader2, Plus, Trash } from 'lucide-react';
import { GRADE_LEVELS } from '@/lib/constants';

const questionTypes = [
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'true_false', label: 'True/False' },
  { value: 'short_answer', label: 'Short Answer' },
];

const assessmentTypes = [
  { value: 'quiz', label: 'Quiz' },
  { value: 'exam', label: 'Exam' },
  { value: 'homework', label: 'Homework' },
];

const formSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  subject: z.string().min(1, 'Subject is required'),
  gradeLevel: z.string().min(1, 'Choose a grade'),
  type: z.enum(['quiz', 'exam', 'homework']),
  duration: z.number().min(1, 'Duration must be at least 1 minute'),
  passingScore: z.number().min(0, 'Passing score must be at least 0').max(100, 'Passing score cannot exceed 100'),
  questions: z.array(z.object({
    question: z.string().min(1, 'Question is required'),
    type: z.enum(['multiple_choice', 'true_false', 'short_answer']),
    options: z.array(z.string()).optional(),
    correctAnswer: z.string().min(1, 'Correct answer is required'),
    points: z.number().min(1, 'Points must be at least 1'),
    explanation: z.string().optional(),
  })).min(1, 'At least one question is required'),
  dueDate: z.string().optional(),
});

interface AssessmentFormProps {
  initialData?: any;
  onSubmit: (data: any) => Promise<void>;
}

export function AssessmentForm({ initialData, onSubmit }: AssessmentFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      title: '',
      description: '',
      subject: '',
      gradeLevel: '',
      type: 'quiz',
      duration: 30,
      passingScore: 60,
      questions: [],
      dueDate: '',
    },
  });

  const handleSubmit = async (data: z.infer<typeof formSchema>) => {
    try {
      setIsSubmitting(true);
      await onSubmit(data);
      toast({
        title: 'Success',
        description: initialData ? 'Assessment updated' : 'Saved as a draft. Publish it from the Assessments page when students should see it.',
      });
      router.push('/assessments');
    } catch (error) {
      console.error('Error submitting assessment:', error);
      toast({
        title: 'Error',
        description: (error as Error)?.message || 'Failed to submit assessment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const addQuestion = () => {
    const questions = form.getValues('questions');
    form.setValue('questions', [
      ...questions,
      {
        question: '',
        type: 'multiple_choice',
        options: ['', '', '', ''],
        correctAnswer: '',
        points: 1,
        explanation: '',
      },
    ]);
  };

  const removeQuestion = (index: number) => {
    const questions = form.getValues('questions');
    form.setValue('questions', questions.filter((_: unknown, i: number) => i !== index));
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Assessment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subject</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gradeLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grade</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a grade" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {GRADE_LEVELS.map((grade) => (
                          <SelectItem key={grade} value={grade}>
                            {grade.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>Students in this grade see it once you publish.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assessment Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {assessmentTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="duration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (minutes)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium">Total points</p>
                <p className="text-sm text-muted-foreground">
                  {form.watch('questions').reduce((sum: number, q: { points?: number }) => sum + (Number(q.points) || 0), 0)} (adds up the points for each question)
                </p>
              </div>

              <FormField
                control={form.control}
                name="passingScore"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Passing Score (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due Date (Optional)</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {form.watch('questions').map((question: any, index: number) => (
              <Card key={index}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Question {index + 1}
                  </CardTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeQuestion(index)}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name={`questions.${index}.question`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Question Text</FormLabel>
                        <FormControl>
                          <Textarea {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`questions.${index}.type`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Question Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {questionTypes.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {question.type === 'multiple_choice' && (
                    <div className="space-y-4">
                      {[0, 1, 2, 3].map((optionIndex) => (
                        <FormField
                          key={optionIndex}
                          control={form.control}
                          name={`questions.${index}.options.${optionIndex}`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Option {optionIndex + 1}</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name={`questions.${index}.correctAnswer`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Correct Answer</FormLabel>
                        <FormControl>
                          {question.type === 'multiple_choice' ? (
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Pick the correct option" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {(question.options ?? [])
                                  .filter((option: string) => option?.trim())
                                  .map((option: string, optionIndex: number) => (
                                    <SelectItem key={optionIndex} value={option}>
                                      {option}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          ) : question.type === 'true_false' ? (
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select answer" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="true">True</SelectItem>
                                <SelectItem value="false">False</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input {...field} />
                          )}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`questions.${index}.points`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Points</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) =>
                              field.onChange(parseInt(e.target.value))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`questions.${index}.explanation`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Explanation (Optional)</FormLabel>
                        <FormControl>
                          <Textarea {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            ))}

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={addQuestion}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Question
            </Button>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {initialData ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                <>{initialData ? 'Update' : 'Create'} Assessment</>
              )}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
} 