import { Assessment } from "@/lib/models/Assessment";
import { connectToDatabase } from "@/lib/db";

export async function getAssessments() {
    try {
        await connectToDatabase();
        const assessments = await Assessment.find({})
            .sort({ createdAt: -1 })
            .lean();
        return assessments;
    } catch (error) {
        console.error("Error fetching assessments:", error);
        throw error;
    }
}

export async function getAssessmentById(id: string) {
    try {
        await connectToDatabase();
        const assessment = await Assessment.findById(id).lean();
        return assessment;
    } catch (error) {
        console.error("Error fetching assessment:", error);
        throw error;
    }
}

export async function createAssessment(assessmentData: any) {
    try {
        await connectToDatabase();
        const assessment = await Assessment.create(assessmentData);
        return assessment;
    } catch (error) {
        console.error("Error creating assessment:", error);
        throw error;
    }
}

export async function updateAssessment(id: string, assessmentData: any) {
    try {
        await connectToDatabase();
        const assessment = await Assessment.findByIdAndUpdate(
            id,
            { $set: assessmentData },
            { new: true }
        ).lean();
        return assessment;
    } catch (error) {
        console.error("Error updating assessment:", error);
        throw error;
    }
}

export async function deleteAssessment(id: string) {
    try {
        await connectToDatabase();
        await Assessment.findByIdAndDelete(id);
        return true;
    } catch (error) {
        console.error("Error deleting assessment:", error);
        throw error;
    }
}

export async function getAssessmentResults() {
    try {
        await connectToDatabase();
        const results = await Assessment.aggregate([
            {
                $lookup: {
                    from: "assessmentresults",
                    localField: "_id",
                    foreignField: "assessmentId",
                    as: "results"
                }
            },
            {
                $unwind: "$results"
            },
            {
                $project: {
                    assessment: "$$ROOT",
                    score: "$results.score",
                    studentId: "$results.studentId",
                    submittedAt: "$results.submittedAt"
                }
            }
        ]);
        return results;
    } catch (error) {
        console.error("Error fetching assessment results:", error);
        throw error;
    }
}

export async function submitAssessment(
    assessmentId: string,
    studentId: string,
    answers: any[],
    score: number
) {
    try {
        await connectToDatabase();
        const result = await Assessment.findByIdAndUpdate(
            assessmentId,
            {
                $push: {
                    results: {
                        studentId,
                        answers,
                        score,
                        submittedAt: new Date()
                    }
                }
            },
            { new: true }
        ).lean();
        return result;
    } catch (error) {
        console.error("Error submitting assessment:", error);
        throw error;
    }
} 